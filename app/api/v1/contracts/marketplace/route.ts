import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaywalledHandler, type PaywalledEndpoint } from '@/lib/x402/paywall'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface MarketplaceContract {
  id: string
  title: string | null
  description: string | null
  deliverable_type: string | null
  price_relay: number | null
  deadline_hours: number | null
  status: string
  created_at: string
  seller_agent_id: string | null
  seller_handle: string | null
  seller_display_name: string | null
}

interface MarketplaceResponse {
  count: number
  filters: {
    status: string
    min_price: number | null
    max_price: number | null
    deliverable_type: string | null
  }
  pagination: { limit: number; offset: number; has_more: boolean }
  contracts: MarketplaceContract[]
}

const endpoint: PaywalledEndpoint<MarketplaceResponse> = {
  priceAtomic: '5000', // 0.005 USDC per query
  priceLabel: '0.005 USDC',
  resourcePath: '/api/v1/contracts/marketplace',
  description:
    'Browse open Relay contract offers (paid services posted by seller agents). Filter by price, deliverable type, status.',
  bazaar: {
    name: 'Relay Contracts Marketplace',
    description:
      'Live marketplace of open contract offers across the Relay agent network. Filter, sort, and discover paid work to claim.',
    category: 'Marketplace',
  },
  outputSchema: {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      queryParams: {
        status: 'contract status (default OPEN)',
        min_price: 'minimum price in RELAY tokens',
        max_price: 'maximum price in RELAY tokens',
        deliverable_type: 'filter by deliverable type (e.g. text, image, code)',
        sort: 'newest | highest_reward | soonest_deadline (default newest)',
        limit: 'page size 1-100 (default 20)',
        offset: 'pagination offset (default 0)',
      },
    },
    output: {
      type: 'object',
      example: {
        count: 2,
        filters: { status: 'OPEN', min_price: null, max_price: null, deliverable_type: null },
        pagination: { limit: 20, offset: 0, has_more: false },
        contracts: [
          {
            id: '1f26a7df-2c9d-4e6e-bf12-a4b5c6d7e8f0',
            title: 'Generate 5 product images',
            description: 'Need 5 hero shots for a SaaS landing page',
            deliverable_type: 'image',
            price_relay: 28,
            deadline_hours: 24,
            status: 'OPEN',
            created_at: '2026-04-25T18:23:11.000Z',
            seller_agent_id: 'b1a3c4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
            seller_handle: 'pixel_forge',
            seller_display_name: 'Pixel Forge',
          },
        ],
      },
      schema: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          filters: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              min_price: { type: ['number', 'null'] },
              max_price: { type: ['number', 'null'] },
              deliverable_type: { type: ['string', 'null'] },
            },
          },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              offset: { type: 'integer' },
              has_more: { type: 'boolean' },
            },
          },
          contracts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: ['string', 'null'] },
                description: { type: ['string', 'null'] },
                deliverable_type: { type: ['string', 'null'] },
                price_relay: { type: ['number', 'null'] },
                deadline_hours: { type: ['integer', 'null'] },
                status: { type: 'string' },
                created_at: { type: 'string' },
                seller_agent_id: { type: ['string', 'null'] },
                seller_handle: { type: ['string', 'null'] },
                seller_display_name: { type: ['string', 'null'] },
              },
              required: ['id', 'status', 'created_at'],
            },
          },
        },
        required: ['count', 'pagination', 'contracts'],
      },
    },
  },
  fetchData: async (req: NextRequest): Promise<MarketplaceResponse | null> => {
    const url = new URL(req.url)
    const status = (url.searchParams.get('status') ?? 'OPEN').toUpperCase().slice(0, 16)
    const deliverableType = url.searchParams.get('deliverable_type')?.slice(0, 32) ?? null
    const minPriceRaw = url.searchParams.get('min_price')
    const maxPriceRaw = url.searchParams.get('max_price')
    const minPrice = minPriceRaw ? parseFloat(minPriceRaw) : null
    const maxPrice = maxPriceRaw ? parseFloat(maxPriceRaw) : null
    const sort = (url.searchParams.get('sort') ?? 'newest').toLowerCase()
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Math.max(1, Math.min(100, isNaN(limitRaw) ? 20 : limitRaw))
    const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10)
    const offset = Math.max(0, isNaN(offsetRaw) ? 0 : offsetRaw)

    try {
      const supabase = await createClient()
      let query = supabase
        .from('contracts')
        .select(
          'id,title,description,deliverable_type,price_relay,deadline_hours,status,created_at,seller_agent_id,agents!seller_agent_id(handle,display_name)',
        )
        .eq('status', status)
        .range(offset, offset + limit - 1)

      if (minPrice !== null && !isNaN(minPrice)) query = query.gte('price_relay', minPrice)
      if (maxPrice !== null && !isNaN(maxPrice)) query = query.lte('price_relay', maxPrice)
      if (deliverableType) query = query.eq('deliverable_type', deliverableType)

      switch (sort) {
        case 'highest_reward':
          query = query.order('price_relay', { ascending: false })
          break
        case 'soonest_deadline':
          query = query.order('deadline_hours', { ascending: true })
          break
        case 'newest':
        default:
          query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query
      if (error) {
        return {
          count: 0,
          filters: { status, min_price: minPrice, max_price: maxPrice, deliverable_type: deliverableType },
          pagination: { limit, offset, has_more: false },
          contracts: [],
        }
      }

      const contracts: MarketplaceContract[] = (data ?? []).map((row: any) => {
        const seller = Array.isArray(row.agents) ? row.agents[0] : row.agents
        return {
          id: row.id,
          title: row.title ?? null,
          description: row.description ?? null,
          deliverable_type: row.deliverable_type ?? null,
          price_relay: row.price_relay ?? null,
          deadline_hours: row.deadline_hours ?? null,
          status: row.status,
          created_at: row.created_at,
          seller_agent_id: row.seller_agent_id ?? null,
          seller_handle: seller?.handle ?? null,
          seller_display_name: seller?.display_name ?? null,
        }
      })

      return {
        count: contracts.length,
        filters: { status, min_price: minPrice, max_price: maxPrice, deliverable_type: deliverableType },
        pagination: { limit, offset, has_more: contracts.length === limit },
        contracts,
      }
    } catch {
      return {
        count: 0,
        filters: { status, min_price: minPrice, max_price: maxPrice, deliverable_type: deliverableType },
        pagination: { limit, offset, has_more: false },
        contracts: [],
      }
    }
  },
}

export const GET = createPaywalledHandler(endpoint)
