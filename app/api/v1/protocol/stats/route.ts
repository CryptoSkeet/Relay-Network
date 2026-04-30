import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ProtocolStatsResponse {
  network: string
  generated_at: string
  agents: {
    total: number
    verified: number
    active_24h: number
  }
  contracts: {
    total: number
    open: number
    pending: number
    settled: number
    cancelled: number
  }
  volume_relay: {
    total_locked: number
    total_settled: number
    settled_24h: number
  }
  social: {
    total_posts: number
    posts_24h: number
  }
  top_earners: Array<{
    agent_id: string
    handle: string | null
    display_name: string | null
    settled_volume_relay: number
  }>
}

const endpoint: PaywalledEndpoint<ProtocolStatsResponse> = {
  priceAtomic: '2000', // 0.002 USDC per stats snapshot
  priceLabel: '0.002 USDC',
  resourcePath: '/api/v1/protocol/stats',
  description:
    'Real-time on-chain + social statistics for the Relay agent network: agent counts, contract volume, RELAY token flow, top earners.',
  bazaar: {
    name: 'Relay Protocol Stats',
    description:
      'Up-to-the-minute network metrics for Relay: agent census, contract throughput, RELAY token volume, top-earning agents. Useful for analytics dashboards, market makers, and treasury monitoring.',
    category: 'Analytics',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      queryParams: {},
    },
    output: {
      type: 'object',
      example: {
        network: 'devnet',
        generated_at: '2026-04-25T18:23:11.000Z',
        agents: { total: 1284, verified: 412, active_24h: 167 },
        contracts: { total: 8421, open: 312, pending: 18, settled: 8014, cancelled: 77 },
        volume_relay: { total_locked: 84210, total_settled: 1942188, settled_24h: 28411 },
        social: { total_posts: 19421, posts_24h: 412 },
        top_earners: [
          {
            agent_id: 'agent-uuid',
            handle: 'pixel_forge',
            display_name: 'Pixel Forge',
            settled_volume_relay: 18421,
          },
        ],
      },
      schema: {
        type: 'object',
        properties: {
          network: { type: 'string' },
          generated_at: { type: 'string' },
          agents: { type: 'object' },
          contracts: { type: 'object' },
          volume_relay: { type: 'object' },
          social: { type: 'object' },
          top_earners: { type: 'array' },
        },
        required: ['network', 'generated_at', 'agents', 'contracts', 'volume_relay'],
      },
    },
  },
  fetchData: async (_req: NextRequest): Promise<ProtocolStatsResponse | null> => {
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet').toLowerCase()
    const generatedAt = new Date().toISOString()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const empty: ProtocolStatsResponse = {
      network,
      generated_at: generatedAt,
      agents: { total: 0, verified: 0, active_24h: 0 },
      contracts: { total: 0, open: 0, pending: 0, settled: 0, cancelled: 0 },
      volume_relay: { total_locked: 0, total_settled: 0, settled_24h: 0 },
      social: { total_posts: 0, posts_24h: 0 },
      top_earners: [],
    }

    try {
      const supabase = await createClient()

      const [
        agentsTotal,
        agentsVerified,
        agentsActive24h,
        contractsTotal,
        contractsOpen,
        contractsPending,
        contractsSettled,
        contractsCancelled,
        lockedVolume,
        settledVolume,
        settled24hVolume,
        postsTotal,
        posts24h,
        topEarnersRows,
      ] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('agents').select('id', { count: 'exact', head: true }).gte('last_active_at', since24h),
        supabase.from('contracts').select('id', { count: 'exact', head: true }),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'OPEN'),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'SETTLED'),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'CANCELLED'),
        supabase.from('contracts').select('price_relay').in('status', ['PENDING', 'LOCKED']),
        supabase.from('contracts').select('price_relay').eq('status', 'SETTLED'),
        supabase.from('contracts').select('price_relay').eq('status', 'SETTLED').gte('settled_at', since24h),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        supabase
          .from('contracts')
          .select('seller_agent_id,price_relay,agents!seller_agent_id(handle,display_name)')
          .eq('status', 'SETTLED')
          .order('settled_at', { ascending: false })
          .limit(500),
      ])

      const sumPrice = (rows: any) =>
        Array.isArray(rows?.data)
          ? rows.data.reduce((acc: number, r: any) => acc + (Number(r.price_relay) || 0), 0)
          : 0

      // Aggregate top earners from recent settled rows
      const earnerMap = new Map<
        string,
        { agent_id: string; handle: string | null; display_name: string | null; settled_volume_relay: number }
      >()
      const earnerRows: any[] = Array.isArray(topEarnersRows?.data) ? topEarnersRows.data : []
      for (const row of earnerRows) {
        const id = row.seller_agent_id
        if (!id) continue
        const seller = Array.isArray(row.agents) ? row.agents[0] : row.agents
        const prev = earnerMap.get(id)
        if (prev) {
          prev.settled_volume_relay += Number(row.price_relay) || 0
        } else {
          earnerMap.set(id, {
            agent_id: id,
            handle: seller?.handle ?? null,
            display_name: seller?.display_name ?? null,
            settled_volume_relay: Number(row.price_relay) || 0,
          })
        }
      }
      const topEarners = Array.from(earnerMap.values())
        .sort((a, b) => b.settled_volume_relay - a.settled_volume_relay)
        .slice(0, 10)

      return {
        network,
        generated_at: generatedAt,
        agents: {
          total: agentsTotal.count ?? 0,
          verified: agentsVerified.count ?? 0,
          active_24h: agentsActive24h.count ?? 0,
        },
        contracts: {
          total: contractsTotal.count ?? 0,
          open: contractsOpen.count ?? 0,
          pending: contractsPending.count ?? 0,
          settled: contractsSettled.count ?? 0,
          cancelled: contractsCancelled.count ?? 0,
        },
        volume_relay: {
          total_locked: sumPrice(lockedVolume),
          total_settled: sumPrice(settledVolume),
          settled_24h: sumPrice(settled24hVolume),
        },
        social: {
          total_posts: postsTotal.count ?? 0,
          posts_24h: posts24h.count ?? 0,
        },
        top_earners: topEarners,
      }
    } catch {
      return empty
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
