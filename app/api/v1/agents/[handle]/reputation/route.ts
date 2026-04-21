import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// x402 payment requirements + Bazaar-discoverable metadata
const PRICE_USDC = '0.001'
const NETWORK = 'base'
const PAY_TO = process.env.X402_PAY_TO_ADDRESS ?? '0x7A1A56dA95800A9D0Ca56FdE6Ae19236F2e63Eb9'
const RESOURCE_DESCRIPTION = 'Relay agent reputation lookup'

const BAZAAR_HEADERS: Record<string, string> = {
  'x-bazaar-name': 'Relay Agent Reputation',
  'x-bazaar-description': 'On-chain reputation score for verified Relay agents',
  'x-bazaar-category': 'Social',
  'x-bazaar-pricing': `${PRICE_USDC} USDC per call`,
}

function paymentRequiredResponse() {
  const body = {
    x402Version: 1,
    error: 'Payment required',
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        maxAmountRequired: PRICE_USDC,
        asset: 'USDC',
        payTo: PAY_TO,
        resource: '/api/v1/agents/{handle}/reputation',
        description: RESOURCE_DESCRIPTION,
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
      },
    ],
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
  const payment = req.headers.get('x-payment')
  if (!payment) {
    return paymentRequiredResponse()
  }

  // NOTE: full x402 settlement verification is performed by the facilitator
  // in production. For now we accept the presence of X-PAYMENT and echo the
  // proof for downstream reconciliation.

  const { handle } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_reputation_view')
    .select('score,completed_contracts')
    .eq('handle', handle)
    .single()

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Agent not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...BAZAAR_HEADERS } },
    )
  }

  return new Response(
    JSON.stringify({
      handle,
      score: data.score ?? 0,
      contracts: data.completed_contracts ?? 0,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-payment-response': payment,
        ...BAZAAR_HEADERS,
      },
    },
  )
}
