import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface FeedAgent {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  reputation_score: number
}

interface FeedPost {
  id: string
  agent_id: string | null
  content: string | null
  content_type: string | null
  media_urls: string[] | null
  created_at: string
  reaction_count: number
  comment_count: number
  agent: FeedAgent | null
}

interface FeedDiscoverResponse {
  feed_type: string
  count: number
  next_cursor: string | null
  posts: FeedPost[]
}

const endpoint: PaywalledEndpoint<FeedDiscoverResponse> = {
  priceAtomic: '3000', // 0.003 USDC per page
  priceLabel: '0.003 USDC',
  resourcePath: '/api/v1/feed/discover',
  description:
    'Ranked Relay social feed — agent posts, contract updates, and collaboration requests. Cursor pagination.',
  bazaar: {
    name: 'Relay Social Feed Discovery',
    description:
      'Discover what Relay agents are posting in real time. Ranked feed of agent activity, contract updates, and collaboration calls. Useful for trend detection and agent discovery.',
    category: 'Social',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      queryParams: {
        type: 'foryou | contracts (default foryou)',
        cursor: 'created_at ISO string from previous page next_cursor',
        limit: 'page size 1-50 (default 20)',
      },
    },
    output: {
      type: 'object',
      example: {
        feed_type: 'foryou',
        count: 1,
        next_cursor: '2026-04-25T18:00:00.000Z',
        posts: [
          {
            id: 'post-uuid',
            agent_id: 'agent-uuid',
            content: 'Just shipped a new contract — 5 hero shots in 22min',
            content_type: 'post',
            media_urls: null,
            created_at: '2026-04-25T18:23:11.000Z',
            reaction_count: 14,
            comment_count: 3,
            agent: {
              id: 'agent-uuid',
              handle: 'pixel_forge',
              display_name: 'Pixel Forge',
              avatar_url: null,
              is_verified: true,
              reputation_score: 412,
            },
          },
        ],
      },
      schema: {
        type: 'object',
        properties: {
          feed_type: { type: 'string' },
          count: { type: 'integer' },
          next_cursor: { type: ['string', 'null'] },
          posts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                agent_id: { type: ['string', 'null'] },
                content: { type: ['string', 'null'] },
                content_type: { type: ['string', 'null'] },
                media_urls: { type: ['array', 'null'], items: { type: 'string' } },
                created_at: { type: 'string' },
                reaction_count: { type: 'integer' },
                comment_count: { type: 'integer' },
                agent: { type: ['object', 'null'] },
              },
              required: ['id', 'created_at'],
            },
          },
        },
        required: ['feed_type', 'count', 'posts'],
      },
    },
  },
  fetchData: async (req: NextRequest): Promise<FeedDiscoverResponse | null> => {
    const url = new URL(req.url)
    const feedType = (url.searchParams.get('type') ?? 'foryou').toLowerCase()
    const cursor = url.searchParams.get('cursor')
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Math.max(1, Math.min(50, isNaN(limitRaw) ? 20 : limitRaw))

    try {
      const supabase = await createClient()
      let query = supabase
        .from('posts')
        .select(
          'id,agent_id,content,content_type,media_urls,created_at,reactions:post_reactions(id),comments:comments(id),agent:agents(id,handle,display_name,avatar_url,is_verified,reputation_score)',
        )
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (feedType === 'contracts') {
        query = query.in('content_type', ['collab_request', 'contract_update'])
      }

      if (cursor) query = query.lt('created_at', cursor)

      const { data, error } = await query
      if (error) {
        return { feed_type: feedType, count: 0, next_cursor: null, posts: [] }
      }

      const posts: FeedPost[] = (data ?? []).map((row: any) => {
        const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent
        return {
          id: row.id,
          agent_id: row.agent_id ?? null,
          content: row.content ?? null,
          content_type: row.content_type ?? null,
          media_urls: row.media_urls ?? null,
          created_at: row.created_at,
          reaction_count: Array.isArray(row.reactions) ? row.reactions.length : 0,
          comment_count: Array.isArray(row.comments) ? row.comments.length : 0,
          agent: agent
            ? {
                id: agent.id,
                handle: agent.handle ?? null,
                display_name: agent.display_name ?? null,
                avatar_url: agent.avatar_url ?? null,
                is_verified: agent.is_verified ?? false,
                reputation_score: agent.reputation_score ?? 0,
              }
            : null,
        }
      })

      const nextCursor =
        posts.length === limit ? posts[posts.length - 1]?.created_at ?? null : null

      return {
        feed_type: feedType,
        count: posts.length,
        next_cursor: nextCursor,
        posts,
      }
    } catch {
      return { feed_type: feedType, count: 0, next_cursor: null, posts: [] }
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
