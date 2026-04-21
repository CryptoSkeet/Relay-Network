import { NextRequest } from 'next/server'
import {
  HTTPFacilitatorClient,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PRICE_USDC = '0.001'
const PRICE_ATOMIC = '1000'
const NETWORK = 'solana'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PAY_TO =
  process.env.X402_PAY_TO_ADDRESS ??
  process.env.RELAY_WALLET_FOUNDATION_TREASURY ??
  '4TmAbwMAMqHSUPDWgFLZn9Ep3A3w5hqnY461dhg3xgaz'
const RESOURCE_DESCRIPTION = 'Relay agent reputation lookup'

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator'

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL })

// Facilitator-managed fee payer (pays SOL gas; required by PayAI x402 Solana facilitator).
// Override with X402_FEE_PAYER for self-hosted facilitators.
const FEE_PAYER =
  process.env.X402_FEE_PAYER ?? '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4'

const PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.X402_PUBLIC_BASE_URL ??
  'https://relaynetwork.ai'
)
  .trim()
  .replace(/\s+/g, '')
  .replace(/\/+$/, '')

// v1 Bazaar discovery payload (lives under outputSchema for x402 v1).
// Facilitators that support the bazaar extension catalog this metadata
// when they process a verify+settle for the endpoint.
const BAZAAR_OUTPUT_SCHEMA = {
  input: {
    type: 'http',
    method: 'GET',
    discoverable: true,
    pathParams: {
      handle: 'relay-agent-handle (e.g. relay_foundation, mesa_open)',
    },
  },
  output: {
    type: 'object',
    example: {
      handle: 'relay_foundation',
      score: 1000,
      contracts: 655,
    },
    schema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        score: { type: 'integer' },
        contracts: { type: 'integer' },
      },
      required: ['handle', 'score', 'contracts'],
    },
  },
} as const

function buildPaymentRequirements(resourceUrl: string) {
  return {
    scheme: 'exact' as const,
    network: NETWORK,
    maxAmountRequired: PRICE_ATOMIC,
    asset: USDC_MINT,
    payTo: PAY_TO,
    resource: resourceUrl,
    description: RESOURCE_DESCRIPTION,
    mimeType: 'application/json',
    maxTimeoutSeconds: 60,
    outputSchema: BAZAAR_OUTPUT_SCHEMA,
    extra: {
      feePayer: FEE_PAYER,
      assetSymbol: 'USDC',
      assetDecimals: 6,
    },
  }
}

const BAZAAR_HEADERS: Record<string, string> = {
  'x-bazaar-name': 'Relay Agent Reputation',
  'x-bazaar-description': 'On-chain reputation score for verified Relay agents (Solana / x402)',
  'x-bazaar-category': 'Social',
  'x-bazaar-pricing': `${PRICE_USDC} USDC per call`,
  'x-bazaar-network': NETWORK,
}

function paymentRequiredResponse(
  paymentRequirements: ReturnType<typeof buildPaymentRequirements>,
  extraError?: string,
) {
  const body = {
    x402Version: 1,
    error: extraError ?? 'Payment required',
    accepts: [paymentRequirements],
  }
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'Content-Type': 'application/json', ...BAZAAR_HEADERS },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params
  const resourceUrl = `${PUBLIC_BASE_URL}/api/v1/agents/${encodeURIComponent(handle)}/reputation`
  const paymentRequirements = buildPaymentRequirements(resourceUrl)

  const paymentHeader = req.headers.get('x-payment')
  if (!paymentHeader) {
    return paymentRequiredResponse(paymentRequirements)
  }

  let paymentPayload
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader)
  } catch (e) {
    return paymentRequiredResponse(
      paymentRequirements,
      `Invalid X-PAYMENT header: ${(e as Error).message}`,
    )
  }

  try {
    const verification = await facilitator.verify(
      paymentPayload,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentRequirements as any,
    )
    if (!verification.isValid) {
      return paymentRequiredResponse(
        paymentRequirements,
        `Payment verification failed: ${verification.invalidReason ?? 'unknown'}`,
      )
    }
  } catch (e) {
    return paymentRequiredResponse(
      paymentRequirements,
      `Facilitator verify error: ${(e as Error).message}`,
    )
  }

  // Reputation lookup — degrade gracefully if view/agent missing so paid
  // callers still get a response and on-chain settlement still occurs.
  let score = 0
  let contracts = 0
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('agent_reputation_view')
      .select('score,completed_contracts')
      .eq('handle', handle)
      .single()
    if (data) {
      score = data.score ?? 0
      contracts = data.completed_contracts ?? 0
    }
  } catch {
    // swallow — proceed to settle with zeroed reputation
  }

  let settlementHeader: string
  try {
    const settlement = await facilitator.settle(
      paymentPayload,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentRequirements as any,
    )
    if (!settlement.success) {
      return paymentRequiredResponse(
        paymentRequirements,
        `Payment settlement failed: ${settlement.errorReason ?? 'unknown'}`,
      )
    }
    settlementHeader = encodePaymentResponseHeader(settlement)
  } catch (e) {
    return paymentRequiredResponse(
      paymentRequirements,
      `Facilitator settle error: ${(e as Error).message}`,
    )
  }

  return new Response(
    JSON.stringify({
      handle,
      score,
      contracts,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-payment-response': settlementHeader,
        ...BAZAAR_HEADERS,
      },
    },
  )
}