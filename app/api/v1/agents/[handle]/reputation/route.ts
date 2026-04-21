import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'
import {
  deriveAgentProfilePDA,
  solscanAccountUrl,
} from '@/lib/solana/agent-profile'

export const dynamic = 'force-dynamic'

interface ReputationResponse {
  handle: string
  score: number
  contracts: number
  onchain_profile_pda: string | null
  onchain_profile_solscan_url: string | null
}

function extractHandle(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean)
  const idx = segments.indexOf('agents')
  return idx >= 0 ? decodeURIComponent(segments[idx + 1] ?? '') : ''
}

const endpoint: PaywalledEndpoint<ReputationResponse> = {
  priceAtomic: '1000',
  priceLabel: '0.001 USDC',
  resourcePath: '/api/v1/agents/{handle}/reputation',
  description: 'Relay agent reputation lookup',
  bazaar: {
    name: 'Relay Agent Reputation',
    description: 'On-chain reputation score for verified Relay agents (Solana / x402)',
    category: 'Social',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      pathParams: { handle: 'relay-agent-handle (e.g. relay_foundation, mesa_open)' },
    },
    output: {
      type: 'object',
      example: {
        handle: 'relay_foundation',
        score: 1000,
        contracts: 655,
        onchain_profile_pda: 'derived from [b"profile", utf8(handle)]',
        onchain_profile_solscan_url: 'https://solscan.io/account/<pda>',
      },
      schema: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          score: { type: 'integer' },
          contracts: { type: 'integer' },
          onchain_profile_pda: { type: ['string', 'null'] },
          onchain_profile_solscan_url: { type: ['string', 'null'] },
        },
        required: ['handle', 'score', 'contracts'],
      },
    },
  },
  fetchData: async (req): Promise<ReputationResponse | null> => {
    const handle = extractHandle(req)
    if (!handle) return null

    let pda: string | null = null
    let pdaUrl: string | null = null
    try {
      const handleBytes = Buffer.from(handle, 'utf8').length
      if (handleBytes >= 1 && handleBytes <= 32) {
        const [pdaKey] = deriveAgentProfilePDA(handle)
        pda = pdaKey.toBase58()
        pdaUrl = solscanAccountUrl(pdaKey)
      }
    } catch {
      /* best-effort */
    }

    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('agent_reputation_view')
        .select('score,completed_contracts')
        .eq('handle', handle)
        .single()
      return {
        handle,
        score: data?.score ?? 0,
        contracts: data?.completed_contracts ?? 0,
        onchain_profile_pda: pda,
        onchain_profile_solscan_url: pdaUrl,
      }
    } catch {
      return {
        handle,
        score: 0,
        contracts: 0,
        onchain_profile_pda: pda,
        onchain_profile_solscan_url: pdaUrl,
      }
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
