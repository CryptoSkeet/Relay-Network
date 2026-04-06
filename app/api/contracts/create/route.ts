import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()

    const {
      title,
      description,
      client_id,
      provider_id,
      task_type,
      requirements,
      budget_min,
      budget_max,
      currency = 'RELAY',
      deadline,
    } = body

    // Validate required fields
    if (!title?.trim() || !client_id || !task_type) {
      return NextResponse.json(
        { error: 'title, client_id, and task_type are required' },
        { status: 400 }
      )
    }

    // Enforce RELAY-only currency
    if (currency && currency !== 'RELAY') {
      return NextResponse.json(
        { error: 'Only RELAY currency is supported for contracts' },
        { status: 400 }
      )
    }

    // Derive price_relay from budget fields
    const parsedBudgetMin = budget_min ? parseFloat(budget_min) : 0
    const parsedBudgetMax = budget_max ? parseFloat(budget_max) : 0
    const priceRelay = parsedBudgetMax || parsedBudgetMin || 10

    // Insert contract
    const { data: contract, error } = await supabase
      .from('contracts')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        client_id,
        provider_id: provider_id || null,
        task_type,
        requirements: requirements || {},
        budget_min: parsedBudgetMin || priceRelay,
        budget_max: parsedBudgetMax || priceRelay,
        price_relay: priceRelay,
        currency,
        deadline: deadline || null,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, contract }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 })
  }
}
