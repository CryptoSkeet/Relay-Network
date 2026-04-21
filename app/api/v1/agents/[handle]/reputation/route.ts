import { NextRequest } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'
import {
  deriveAgentProfilePDA,
  solscanAccountUrl,
} from '@/lib/solana/agent-profile'
import {
  deriveReputationPDA,
  fetchReputation,
  RELAY_REPUTATION_PROGRAM_ID,
} from '@/lib/solana/relay-reputation'

export const dynamic = 'force-dynamic'

interface OnChainBlock {
  program_id: string
  reputation_pda: string
  reputation_solscan_url: string
  score_bps: number
  settled_count: string
  cancelled_count: string
  disputed_count: string
  total_volume: string
  last_updated: number
}

interface ReputationResponse {
  handle: string
  /** DB score (0-1000). Derived deterministically from contracts table. */
  score: number
  contracts: number
  /** On-chain mirror of the DB score, signed by the Relay treasury. If
   *  present, callers can independently verify the score on Solscan
   *  without trusting this API. */
  on_chain: OnChainBlock | null
  /** Profile PDA (relay_agent_profile program, handle-keyed). */
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
        on_chain: {
          program_id: '2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau',
          reputation_pda: '<derived from agent wallet pubkey>',
          reputation_solscan_url: 'https://solscan.io/account/<pda>',
          score_bps: 9750,
          settled_count: '655',
          cancelled_count: '0',
          disputed_count: '0',
          total_volume: '12340000',
          last_updated: 1745236615,
        },
        onchain_profile_pda: 'derived from [b"profile", utf8(handle)]',
        onchain_profile_solscan_url: 'https://solscan.io/account/<pda>',
      },
      schema: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          score: { type: 'integer' },
          contracts: { type: 'integer' },
          on_chain: { type: ['object', 'null'] },
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

    let dbScore = 0
    let dbContracts = 0
    let walletAddress: string | null = null
    try {
      const supabase = await createClient()
      const [{ data: rep }, { data: agent }] = await Promise.all([
        supabase
          .from('agent_reputation_view')
          .select('score,completed_contracts')
          .eq('handle', handle)
          .maybeSingle(),
        supabase
          .from('agents')
          .select('wallet_address')
          .eq('handle', handle)
          .maybeSingle(),
      ])
      dbScore = rep?.score ?? 0
      dbContracts = rep?.completed_contracts ?? 0
      walletAddress = agent?.wallet_address ?? null
    } catch {
      /* fall through to return what we have */
    }

    // Fetch on-chain reputation snapshot. Best-effort — never fails the API.
    let onChain: OnChainBlock | null = null
    if (walletAddress) {
      try {
        const did = new PublicKey(walletAddress)
        const rep = await fetchReputation(did)
        if (rep) {
          const [repPda] = deriveReputationPDA(did)
          onChain = {
            program_id: RELAY_REPUTATION_PROGRAM_ID.toBase58(),
            reputation_pda: repPda.toBase58(),
            reputation_solscan_url: solscanAccountUrl(repPda),
            score_bps: rep.score,
            settled_count: rep.settledCount.toString(),
            cancelled_count: rep.cancelledCount.toString(),
            disputed_count: rep.disputedCount.toString(),
            total_volume: rep.totalVolume.toString(),
            last_updated: rep.lastUpdated,
          }
        }
      } catch {
        /* invalid pubkey or RPC error — ignore */
      }
    }

    return {
      handle,
      score: dbScore,
      contracts: dbContracts,
      on_chain: onChain,
      onchain_profile_pda: pda,
      onchain_profile_solscan_url: pdaUrl,
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
