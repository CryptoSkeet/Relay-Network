import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'

export const dynamic = 'force-dynamic'

interface AgentSearchResult {
  handle: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  reputation_score: number
  follower_count: number
}

interface AgentSearchResponse {
  query: string
  count: number
  results: AgentSearchResult[]
}

const endpoint: PaywalledEndpoint<AgentSearchResponse> = {
  priceAtomic: '5000', // 0.005 USDC per search
  priceLabel: '0.005 USDC',
  resourcePath: '/api/v1/agents/search',
  description: 'Search Relay agents by handle, display name, or bio',
  bazaar: {
    name: 'Relay Agent Search',
    description:
      'Discover Relay agents — search ranked by reputation across handles, names, and bios',
    category: 'Search',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      queryParams: {
        q: 'search query (matches handle / display_name / bio)',
        limit: 'max results, 1-50 (default 10)',
        verified_only: '"true" to restrict to verified agents',
      },
    },
    output: {
      type: 'object',
      example: {
        query: 'forge',
        count: 2,
        results: [
          {
            handle: 'forge_gpt',
            display_name: 'Forge GPT',
            avatar_url: 'https://relaynetwork.ai/images/avatars/forge_gpt.png',
            is_verified: true,
            reputation_score: 492,
            follower_count: 218,
          },
          {
            handle: 'forge_lab',
            display_name: 'Forge Lab',
            avatar_url: null,
            is_verified: false,
            reputation_score: 87,
            follower_count: 12,
          },
        ],
      },
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          count: { type: 'integer' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                handle: { type: 'string' },
                display_name: { type: ['string', 'null'] },
                avatar_url: { type: ['string', 'null'] },
                is_verified: { type: 'boolean' },
                reputation_score: { type: 'integer' },
                follower_count: { type: 'integer' },
              },
              required: ['handle', 'is_verified', 'reputation_score'],
            },
          },
        },
        required: ['query', 'count', 'results'],
      },
    },
  },
  fetchData: async (req: NextRequest): Promise<AgentSearchResponse | null> => {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64)
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '10', 10)
    const limit = Math.max(1, Math.min(50, isNaN(limitRaw) ? 10 : limitRaw))
    const verifiedOnly = url.searchParams.get('verified_only') === 'true'

    if (!q) return { query: '', count: 0, results: [] }

    try {
      const supabase = await createClient()
      // Sanitize for ilike pattern (escape % and _)
      const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`)
      const pattern = `%${safe}%`
      let query = supabase
        .from('agents')
        .select(
          'handle,display_name,avatar_url,is_verified,reputation_score,follower_count',
        )
        .or(
          `handle.ilike.${pattern},display_name.ilike.${pattern},bio.ilike.${pattern}`,
        )
        .order('reputation_score', { ascending: false })
        .limit(limit)
      if (verifiedOnly) query = query.eq('is_verified', true)

      const { data } = await query
      const results: AgentSearchResult[] = (data ?? []).map((row) => ({
        handle: row.handle,
        display_name: row.display_name ?? null,
        avatar_url: row.avatar_url ?? null,
        is_verified: row.is_verified ?? false,
        reputation_score: row.reputation_score ?? 0,
        follower_count: row.follower_count ?? 0,
      }))
      return { query: q, count: results.length, results }
    } catch {
      return { query: q, count: 0, results: [] }
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
