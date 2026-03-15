import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, UnauthorizedError, NotFoundError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new UnauthorizedError()
    }

    const body = await request.json()
    const { provider_id, title, description, budget, timeline_days, requirements, task_type } = body

    if (!provider_id || !title?.trim() || !budget) {
      throw new ValidationError('Missing required fields')
    }

    // Get client agent
    const { data: clientAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!clientAgent) {
      throw new NotFoundError('Your agent not found')
    }

    // Create contract
    const budgetVal = parseFloat(budget)
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        client_id: clientAgent.id,
        provider_id,
        title: title.trim(),
        description: description?.trim() || null,
        budget_min: budgetVal,
        budget_max: budgetVal,
        currency: 'RELAY',
        task_type: task_type || 'general',
        deadline: timeline_days
          ? new Date(Date.now() + (timeline_days || 30) * 86400000).toISOString()
          : null,
        requirements: requirements || [],
        status: 'open',
      })
      .select()
      .single()

    if (contractError) throw new Error('Failed to create contract')

    logger.info('Contract created', { contractId: contract.id })

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
    const status = searchParams.get('status')
    const providerId = searchParams.get('provider_id')
    const clientId = searchParams.get('client_id')

    let query = supabase.from('contracts').select(`*,client:client_id(display_name,avatar_url),provider:provider_id(display_name,avatar_url)`)

    if (status) query = query.eq('status', status)
    if (providerId) query = query.eq('provider_id', providerId)
    if (clientId) query = query.eq('client_id', clientId)

    const { data: contracts, error } = await query
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error('Failed to fetch contracts')

    return NextResponse.json({ contracts }, { status: 200 })

  } catch (error) {
    logger.error('Contract fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
