import { NextRequest } from 'next/server'
import { Connection } from '@solana/web3.js'
import {
  HTTPFacilitatorClient,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
  type FacilitatorConfig,
} from '@x402/core/http'
import { verifyKYAHeader, KYA_HEADER } from '@/lib/solana/kya-credential'

/**
 * Shared x402 + Bazaar discovery paywall for Relay's monetized API surface.
 *
 * Wraps verify -> data fetch -> settle in a reusable handler so each
 * endpoint only declares its price, schema, and data fetcher. All routes
 * share one facilitator config (PayAI Solana by default, CDP optional).
 */

// CAIP-2 network ID. Defaults to Solana mainnet (where USDC mint EPjFWdd5...
// settles). Override via X402_NETWORK_CAIP for other clusters, e.g.:
//   solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp1tu7BL5  (mainnet, canonical)
//   solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1         (devnet, canonical)
//   solana:mainnet / solana:devnet                  (short forms also accepted)
const NETWORK_CAIP =
  process.env.X402_NETWORK_CAIP ??
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp1tu7BL5'

// Friendly network slug for logging / DB rows
const NETWORK_SLUG = NETWORK_CAIP.includes('devnet') || NETWORK_CAIP.includes('EtWTRA')
  ? 'solana:devnet'
  : 'solana:mainnet'

// x402 v1 network slug. The Coinbase v1 schema (used by @agentcash/discovery
// and x402scan probes) requires a short slug — `solana` or `solana-devnet` —
// NOT the CAIP-2 form. Sending the CAIP form here causes registration to fail
// with "No valid x402 response found" (NETWORK_SOLANA_ALIAS_INVALID).
const NETWORK_V1 = NETWORK_CAIP.includes('devnet') || NETWORK_CAIP.includes('EtWTRA')
  ? 'solana-devnet'
  : 'solana'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const PAY_TO =
  process.env.X402_PAY_TO_ADDRESS ??
  process.env.RELAY_WALLET_FOUNDATION_TREASURY ??
  '4TmAbwMAMqHSUPDWgFLZn9Ep3A3w5hqnY461dhg3xgaz'

// Facilitator-managed fee payer (PayAI default). For CDP, the operator's wallet pays gas.
const FEE_PAYER =
  process.env.X402_FEE_PAYER ?? '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4'

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? 'https://facilitator.payai.network'

// CDP facilitator support. Set X402_FACILITATOR_PROVIDER=cdp + CDP_API_KEY_ID/SECRET
// to route through Coinbase CDP's facilitator (canonical Bazaar source for most aggregators).
const FACILITATOR_PROVIDER = (process.env.X402_FACILITATOR_PROVIDER ?? 'payai').toLowerCase()
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET

function buildFacilitatorConfig(): FacilitatorConfig {
  if (FACILITATOR_PROVIDER === 'cdp') {
    if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
      throw new Error(
        'X402_FACILITATOR_PROVIDER=cdp requires CDP_API_KEY_ID and CDP_API_KEY_SECRET env vars',
      )
    }
    const url = process.env.CDP_FACILITATOR_URL ?? 'https://api.cdp.coinbase.com/platform/v2/x402'
    const headers: Record<string, string> = {
      'CDP-API-Key-Id': CDP_API_KEY_ID,
      'CDP-API-Key-Secret': CDP_API_KEY_SECRET,
    }
    return {
      url,
      createAuthHeaders: async () => ({
        verify: headers,
        settle: headers,
        supported: headers,
      }),
    }
  }
  return { url: FACILITATOR_URL }
}

export const facilitator = new HTTPFacilitatorClient(buildFacilitatorConfig())

const PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.X402_PUBLIC_BASE_URL ??
  'https://relaynetwork.ai'
)
  .trim()
  .replace(/\s+/g, '')
  .replace(/\/+$/, '')

export function publicResourceUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${PUBLIC_BASE_URL}${p}`
}

/**
 * v1 Bazaar discovery info that lives under PaymentRequirements.outputSchema.
 * `input.discoverable: true` is what causes facilitators to catalog the endpoint.
 */
export interface BazaarOutputSchema {
  input: {
    type: 'http'
    method: 'GET' | 'POST'
    discoverable: true
    pathParams?: Record<string, string>
    queryParams?: Record<string, string>
    bodyParams?: Record<string, unknown>
  }
  output: {
    type: 'object'
    example: unknown
    schema: unknown
  }
}

export interface BazaarMetadata {
  name: string
  description: string
  category: string
}

export interface PaywalledEndpoint<T> {
  /** Price in atomic USDC units (e.g. "1000" = 0.001 USDC). */
  priceAtomic: string
  /** Human-readable price for headers. */
  priceLabel: string
  /** Resource path (without origin); becomes the canonical resource URL. */
  resourcePath: string
  /** Short description shown in 402 + Bazaar listings. */
  description: string
  /** Bazaar discovery metadata (input/output schema + example). */
  outputSchema: BazaarOutputSchema
  /** Marketing metadata for Bazaar headers. */
  bazaar: BazaarMetadata
  /**
   * Basis-point discount applied when the caller presents a valid KYA
   * credential (e.g. 1000 = 10% off). Defaults to 0 (no discount).
   * Phase 3 will make this dynamic based on reputation score.
   */
  kyaDiscountBps?: number
  /**
   * Fetch the paid response data. Must be safe to fail (return null) — on
   * null we still settle and return an empty payload so the caller doesn't
   * get charged for a failure on our side. (We currently DO settle on null;
   * if you need refund-on-empty, throw instead.)
   */
  fetchData: (req: NextRequest) => Promise<T | null>
}

/**
 * Build dual v1+v2 PaymentRequirements. Top-level v1 envelope (x402Version: 1)
 * is what @agentcash/discovery / x402scan probes parse, so accepts[] must carry
 * all required v1 fields (network as short slug, maxAmountRequired, resource,
 * description, payTo, maxTimeoutSeconds, asset). We additionally include the
 * v2 `amount` field for forward compatibility — Coinbase v2 schema is non-strict
 * and tolerates extra keys.
 */
function buildRequirements<T>(endpoint: PaywalledEndpoint<T>) {
  return {
    scheme: 'exact' as const,
    // v1 short slug — required by @agentcash/discovery v1 parser. CAIP form
    // would trip NETWORK_SOLANA_ALIAS_INVALID and silently drop the resource.
    network: NETWORK_V1,
    // v1 required fields
    maxAmountRequired: endpoint.priceAtomic,
    resource: publicResourceUrl(endpoint.resourcePath),
    description: endpoint.description,
    mimeType: 'application/json',
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    asset: USDC_MINT,
    outputSchema: endpoint.outputSchema,
    // v2 forward-compat (ignored by v1 parser)
    amount: endpoint.priceAtomic,
    extra: {
      feePayer: FEE_PAYER,
      assetSymbol: 'USDC',
      assetDecimals: 6,
      maxAmountRequired: endpoint.priceAtomic,
      name: endpoint.bazaar.name,
      description: endpoint.bazaar.description,
      category: endpoint.bazaar.category,
      // Canonical CAIP-2 form for v2-aware clients that want chain-id specificity.
      networkCaip: NETWORK_CAIP,
    },
  }
}

// HTTP headers must be ByteString (chars 0-255). Strip any non-ASCII
// (em-dash, smart quotes, emoji, etc.) so unicode in copy doesn't crash
// `new Response({ headers })` at runtime.
function toHeaderSafe(s: string): string {
  return s
    .replace(/[\u2013\u2014]/g, '-') // en/em dash
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2026]/g, '...')
    .replace(/[^\x00-\xFF]/g, '?') // anything else outside latin-1
}

function bazaarHeaders<T>(endpoint: PaywalledEndpoint<T>): Record<string, string> {
  return {
    'x-bazaar-name': toHeaderSafe(endpoint.bazaar.name),
    'x-bazaar-description': toHeaderSafe(endpoint.bazaar.description),
    'x-bazaar-category': toHeaderSafe(endpoint.bazaar.category),
    'x-bazaar-pricing': toHeaderSafe(`${endpoint.priceLabel} per call`),
    'x-bazaar-network': NETWORK_CAIP,
  }
}

function paymentRequiredResponse<T>(
  endpoint: PaywalledEndpoint<T>,
  requirements: ReturnType<typeof buildRequirements<T>>,
  extraError?: string,
) {
  // x402 v1 envelope. We MUST emit `x402Version: 1` (not 2) because
  // @agentcash/discovery's v1 body parser hard-rejects any other value with
  // "No valid x402 response found". Since we don't emit a `payment-required`
  // header, the v2 header parser is never invoked — only the v1 body parser
  // runs. v1 has no top-level `resource`/`extensions` fields, but zod parses
  // the envelope non-strict, so we keep them as additive metadata for
  // crawlers (x402scan, x402list.fun, agentcash) that want them.
  const body = {
    x402Version: 1 as const,
    error: extraError ?? 'Payment required',
    accepts: [requirements],
    // Additive metadata — ignored by v1 parser, surfaced to v2-aware crawlers.
    resource: {
      url: publicResourceUrl(endpoint.resourcePath),
      description: endpoint.description,
      mimeType: 'application/json',
    },
    extensions: {
      bazaar: {
        name: endpoint.bazaar.name,
        description: endpoint.bazaar.description,
        category: endpoint.bazaar.category,
        pricing: `${endpoint.priceLabel} per call`,
      },
      outputSchema: endpoint.outputSchema,
      relay: {
        kyaSupported: true,
        kyaDiscountBps: endpoint.kyaDiscountBps ?? 0,
        kyaHeader: KYA_HEADER,
      },
    },
  }
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'Content-Type': 'application/json', ...bazaarHeaders(endpoint) },
  })
}

/**
 * Build a Next.js route handler that gates `endpoint.fetchData` behind x402.
 */
export function createPaywalledHandler<T>(endpoint: PaywalledEndpoint<T>) {
  return async function GET(req: NextRequest): Promise<Response> {
    const requirements = buildRequirements(endpoint)

    const paymentHeader = req.headers.get('x-payment')
    if (!paymentHeader) {
      return paymentRequiredResponse(endpoint, requirements)
    }

    let paymentPayload
    try {
      paymentPayload = decodePaymentSignatureHeader(paymentHeader)
    } catch (e) {
      return paymentRequiredResponse(
        endpoint,
        requirements,
        `Invalid X-PAYMENT header: ${(e as Error).message}`,
      )
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verification = await facilitator.verify(paymentPayload, requirements as any)
      if (!verification.isValid) {
        return paymentRequiredResponse(
          endpoint,
          requirements,
          `Payment verification failed: ${verification.invalidReason ?? 'unknown'}`,
        )
      }
    } catch (e) {
      return paymentRequiredResponse(
        endpoint,
        requirements,
        `Facilitator verify error: ${(e as Error).message}`,
      )
    }

    // Verify KYA credential if present. Best-effort: a missing or invalid
    // credential doesn't block the request (they already paid), but a valid
    // one gets logged and will drive discounts in Phase 3.
    let kyaValid = false
    let kyaDid: string | null = null
    const kyaHeader = req.headers.get(KYA_HEADER)
    if (kyaHeader) {
      try {
        const rpcUrl = process.env.QUICKNODE_RPC_URL
          || process.env.NEXT_PUBLIC_SOLANA_RPC
          || 'https://api.devnet.solana.com'
        const conn = new Connection(rpcUrl, 'confirmed')
        const result = await verifyKYAHeader(kyaHeader, conn)
        kyaValid = result.valid
        if (result.valid && result.credential) {
          kyaDid = result.credential.did
        }
      } catch (e) {
        console.warn('[x402] KYA verification failed:', e)
      }
    }

    let data: T | null = null
    try {
      data = await endpoint.fetchData(req)
    } catch {
      data = null
    }

    let settlementHeader: string
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settlement = await facilitator.settle(paymentPayload, requirements as any)
      if (!settlement.success) {
        return paymentRequiredResponse(
          endpoint,
          requirements,
          `Payment settlement failed: ${settlement.errorReason ?? 'unknown'}`,
        )
      }
      settlementHeader = encodePaymentResponseHeader(settlement)

      // Log inbound revenue (best-effort; never fail the request on a logging error)
      try {
        const { createClient } = await import('@/lib/supabase/server')
        const supabase = await createClient()
        const atomic = settlement.amount ?? endpoint.priceAtomic
        const usdc = Number(atomic) / 1_000_000
        await supabase.from('agent_x402_transactions').insert({
          agent_id:       null,
          direction:      'inbound',
          network:        NETWORK_SLUG,
          resource_url:   publicResourceUrl(endpoint.resourcePath),
          description:    endpoint.description,
          amount_usdc:    usdc,
          tx_signature:   settlement.transaction ?? null,
          payer_address:  settlement.payer ?? null,
          pay_to_address: PAY_TO,
          facilitator:    FACILITATOR_PROVIDER,
          payer_relay_did: kyaDid,
          kya_verified:   kyaValid,
          status:         'completed',
          created_at:     new Date().toISOString(),
        })
      } catch (logErr) {
        console.error('[x402] failed to log inbound revenue:', logErr)
      }
    } catch (e) {
      return paymentRequiredResponse(
        endpoint,
        requirements,
        `Facilitator settle error: ${(e as Error).message}`,
      )
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-payment-response': settlementHeader,
      ...bazaarHeaders(endpoint),
    }
    if (kyaValid) {
      responseHeaders['x-relay-kya-verified'] = 'true'
    }

    return new Response(JSON.stringify(data ?? {}), {
      status: 200,
      headers: responseHeaders,
    })
  }
}
