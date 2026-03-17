import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, UnauthorizedError, NotFoundError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)
    if (!user) throw new UnauthorizedError()

    const body = await request.json().catch(() => null)
    if (!body) throw new ValidationError('Invalid JSON body')

    const {
      provider_id,
      title,
      description,
      budget,
      timeline_days,
      requirements,
      task_type,
      deliverables = [],
      dispute_window_hours = 48,
    } = body

    if (!title?.trim() || !budget) throw new ValidationError('Missing required fields: title, budget')

    const budgetVal = parseFloat(budget)
    if (isNaN(budgetVal) || budgetVal <= 0) throw new ValidationError('budget must be a positive number')

    // Get client agent
    const { data: clientAgent } = await supabase
      .from('agents').select('id').eq('user_id', user.id).limit(1).maybeSingle()
    if (!clientAgent) throw new NotFoundError('Your agent not found')

    // Check wallet balance
    const { data: wallet } = await supabase
      .from('wallets').select('id, balance').eq('agent_id', clientAgent.id).maybeSingle()
    if (!wallet || (wallet.balance ?? 0) < budgetVal) {
      return NextResponse.json(
        { error: `Insufficient RELAY balance. Need ${budgetVal} RELAY.` },
        { status: 402 }
      )
    }

    const deadline = timeline_days
      ? new Date(Date.now() + timeline_days * 86400000).toISOString()
      : new Date(Date.now() + 30 * 86400000).toISOString()

    // Create contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        client_id:            clientAgent.id,
        provider_id:          provider_id ?? null,
        title:                title.trim(),
        description:          description?.trim() || null,
        budget_min:           budgetVal,
        budget_max:           budgetVal,
        currency:             'RELAY',
        task_type:            task_type || 'task',
        deadline,
        requirements:         requirements || [],
        dispute_window_hours,
        status:               provider_id ? 'in_progress' : 'open',
      })
      .select()
      .single()

    if (contractError) throw new Error('Failed to create contract')

    // Create deliverables
    if (deliverables.length > 0) {
      await supabase.from('contract_deliverables').insert(
        deliverables.map((d: { title: string; description?: string }, i: number) => ({
          contract_id:  contract.id,
          title:        d.title,
          description:  d.description ?? '',
          order_index:  i,
          status:       'pending',
        }))
      )
    }

    // Lock funds in escrow
    await supabase.from('escrow').insert({
      contract_id: contract.id,
      payer_id:    clientAgent.id,
      payee_id:    provider_id ?? null,
      amount:      budgetVal,
      currency:    'RELAY',
      status:      'locked',
    })

    // Deduct from wallet
    await supabase.from('wallets')
      .update({ balance: Math.max(0, wallet.balance - budgetVal) })
      .eq('id', wallet.id)

    // Record transaction
    await supabase.from('transactions').insert({
      from_agent_id: clientAgent.id,
      to_agent_id:   null,
      contract_id:   contract.id,
      amount:        budgetVal,
      currency:      'RELAY',
      type:          'escrow',
      status:        'completed',
      description:   `Escrow locked: ${title.trim()}`,
    })

    logger.info('Contract created', { contractId: contract.id, budget: budgetVal })

    return NextResponse.json({ success: true, contract }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Contract creation error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const status     = searchParams.get('status')
    const providerId = searchParams.get('provider_id')
    const clientId   = searchParams.get('client_id')
    const limit      = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let query = supabase
      .from('contracts')
      .select(`
        id, title, description, status, task_type, budget_min, budget_max, currency,
        deadline, created_at, updated_at,
        client:agents!contracts_client_id_fkey(id, handle, display_name, avatar_url),
        provider:agents!contracts_provider_id_fkey(id, handle, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status)     query = query.eq('status', status)
    if (providerId) query = query.eq('provider_id', providerId)
    if (clientId)   query = query.eq('client_id', clientId)

    const { data: contracts, error } = await query
    if (error) throw new Error('Failed to fetch contracts')

    return NextResponse.json({ contracts: contracts ?? [] })

  } catch (error) {
    logger.error('Contract fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
