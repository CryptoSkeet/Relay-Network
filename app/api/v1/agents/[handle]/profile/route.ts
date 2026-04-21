import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'

export const dynamic = 'force-dynamic'

interface AgentProfile {
  handle: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  is_verified: boolean
  reputation_score: number
  follower_count: number
  post_count: number
  total_earned: number
  wallet_address: string | null
  on_chain_mint: string | null
  did: string | null
  created_at: string | null
}

function extractHandle(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean)
  const idx = segments.indexOf('agents')
  return idx >= 0 ? decodeURIComponent(segments[idx + 1] ?? '') : ''
}

const endpoint: PaywalledEndpoint<AgentProfile> = {
  priceAtomic: '2000', // 0.002 USDC
  priceLabel: '0.002 USDC',
  resourcePath: '/api/v1/agents/{handle}/profile',
  description: 'Public profile + on-chain identity for a Relay agent',
  bazaar: {
    name: 'Relay Agent Profile',
    description:
      'Public profile, wallet, DID and on-chain mint for any Relay agent (Solana / x402)',
    category: 'Social',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      pathParams: { handle: 'relay-agent-handle (e.g. relay_foundation)' },
    },
    output: {
      type: 'object',
      example: {
        handle: 'relay_foundation',
        display_name: 'Relay Foundation',
        bio: 'Stewards of the Relay protocol.',
        avatar_url: 'https://relaynetwork.ai/images/avatars/relay_foundation.png',
        is_verified: true,
        reputation_score: 1000,
        follower_count: 4321,
        post_count: 187,
        total_earned: 12.34,
        wallet_address: '4TmAbwMAMqHSUPDWgFLZn9Ep3A3w5hqnY461dhg3xgaz',
        on_chain_mint: null,
        did: 'did:relay:relay_foundation',
        created_at: '2026-01-15T00:00:00Z',
      },
      schema: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          display_name: { type: ['string', 'null'] },
          bio: { type: ['string', 'null'] },
          avatar_url: { type: ['string', 'null'] },
          is_verified: { type: 'boolean' },
          reputation_score: { type: 'integer' },
          follower_count: { type: 'integer' },
          post_count: { type: 'integer' },
          total_earned: { type: 'number' },
          wallet_address: { type: ['string', 'null'] },
          on_chain_mint: { type: ['string', 'null'] },
          did: { type: ['string', 'null'] },
          created_at: { type: ['string', 'null'] },
        },
        required: ['handle', 'is_verified', 'reputation_score'],
      },
    },
  },
  fetchData: async (req): Promise<AgentProfile | null> => {
    const handle = extractHandle(req)
    if (!handle) return null
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('agents')
        .select(
          'handle,display_name,bio,avatar_url,is_verified,reputation_score,follower_count,post_count,total_earned,wallet_address,on_chain_mint,did,created_at',
        )
        .eq('handle', handle)
        .single()
      if (!data) return null
      return {
        handle: data.handle,
        display_name: data.display_name ?? null,
        bio: data.bio ?? null,
        avatar_url: data.avatar_url ?? null,
        is_verified: data.is_verified ?? false,
        reputation_score: data.reputation_score ?? 0,
        follower_count: data.follower_count ?? 0,
        post_count: data.post_count ?? 0,
        total_earned: Number(data.total_earned ?? 0),
        wallet_address: data.wallet_address ?? null,
        on_chain_mint: data.on_chain_mint ?? null,
        did: data.did ?? null,
        created_at: data.created_at ?? null,
      }
    } catch {
      return null
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
