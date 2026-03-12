import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /v1/marketplace - Browse open contracts with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Parse filters
    const capabilities = searchParams.get('capabilities')?.split(',').filter(Boolean) || []
    const minBudget = searchParams.get('min_budget') ? parseFloat(searchParams.get('min_budget')!) : undefined
    const maxBudget = searchParams.get('max_budget') ? parseFloat(searchParams.get('max_budget')!) : undefined
    const minReputation = searchParams.get('min_reputation') ? parseInt(searchParams.get('min_reputation')!) : undefined
    const urgency = searchParams.get('urgency') // 'urgent', 'soon', 'flexible'
    const sortBy = searchParams.get('sort') || 'newest' // 'newest', 'highest_reward', 'deadline'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Base query for open contracts
    let query = supabase
      .from('contracts')
      .select(`
        *,
        client:agents!contracts_client_id_fkey(id, handle, display_name, avatar_url),
        deliverables:contract_deliverables(*),
        escrow:escrow(*),
        capabilities:contract_capabilities(
          capability:capability_tags(*)
        )
      `, { count: 'exact' })
      .eq('status', 'open')

    // Apply budget filters
    if (minBudget !== undefined) {
      query = query.gte('amount', minBudget)
    }
    if (maxBudget !== undefined) {
      query = query.lte('amount', maxBudget)
    }

    // Apply urgency filter based on deadline
    const now = new Date()
    if (urgency === 'urgent') {
      // Due within 24 hours
      const urgentDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      query = query.lte('deadline', urgentDeadline.toISOString())
    } else if (urgency === 'soon') {
      // Due within 7 days
      const soonDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      query = query.lte('deadline', soonDeadline.toISOString())
    }

    // Apply sorting
    switch (sortBy) {
      case 'highest_reward':
        query = query.order('amount', { ascending: false })
        break
      case 'deadline':
        query = query.order('deadline', { ascending: true })
        break
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false })
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: contracts, error, count } = await query

    if (error) {
      console.error('Marketplace query error:', error)
      return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 })
    }

    // Filter by capabilities in-memory (Supabase doesn't support array contains across joins easily)
    let filteredContracts = contracts || []
    if (capabilities.length > 0) {
      filteredContracts = filteredContracts.filter(contract => {
        const contractCaps = contract.capabilities?.map((c: { capability: { name: string } }) => c.capability?.name) || []
        return capabilities.some(cap => contractCaps.includes(cap))
      })
    }

    // Get client reputations
    const clientIds = [...new Set(filteredContracts.map(c => c.client_id))]
    const { data: reputations } = await supabase
      .from('agent_reputation')
      .select('agent_id, reputation_score')
      .in('agent_id', clientIds)

    const reputationMap = new Map(reputations?.map(r => [r.agent_id, r.reputation_score]) || [])

    // Enrich contracts with reputation
    const enrichedContracts = filteredContracts.map(contract => ({
      ...contract,
      client_reputation: reputationMap.get(contract.client_id) || 500,
      deadline_countdown: getDeadlineCountdown(contract.deadline),
    }))

    // Filter by minimum reputation if specified
    const finalContracts = minReputation 
      ? enrichedContracts.filter(c => c.client_reputation >= minReputation)
      : enrichedContracts

    return NextResponse.json({
      contracts: finalContracts,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      },
    })

  } catch (error) {
    console.error('Marketplace error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getDeadlineCountdown(deadline: string): string {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffMs = deadlineDate.getTime() - now.getTime()

  if (diffMs < 0) return 'Expired'

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 24) {
    return `${diffHours}h left`
  } else if (diffDays < 7) {
    return `${diffDays}d left`
  } else {
    return `${Math.floor(diffDays / 7)}w left`
  }
}
