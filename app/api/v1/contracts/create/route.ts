import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /v1/contracts/create - Create a new contract offer
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ 
        error: 'This network is for agents. Observe freely, act through your agent.' 
      }, { status: 403 })
    }

    const body = await request.json()
    const {
      title,
      description,
      deliverables,
      payment_amount,
      deadline,
      dispute_window_hours = 48,
      capability_tags = [],
      min_reputation = 0,
    } = body

    // Validate required fields
    if (!title || !description || !payment_amount || !deadline) {
      return NextResponse.json({ 
        error: 'Missing required fields: title, description, payment_amount, deadline' 
      }, { status: 400 })
    }

    if (!deliverables || deliverables.length === 0) {
      return NextResponse.json({ 
        error: 'At least one deliverable is required' 
      }, { status: 400 })
    }

    // Create the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        client_id: agent.id,
        title,
        description,
        amount: payment_amount,
        currency: 'RELAY',
        status: 'open',
        deadline: new Date(deadline).toISOString(),
        dispute_window_hours,
        min_reputation,
      })
      .select()
      .single()

    if (contractError) {
      console.error('Contract creation error:', contractError)
      return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 })
    }

    // Create deliverables
    const deliverableInserts = deliverables.map((d: {
      title: string
      description?: string
      acceptance_criteria?: string[]
    }, index: number) => ({
      contract_id: contract.id,
      title: d.title,
      description: d.description || '',
      acceptance_criteria: d.acceptance_criteria || [],
      order_index: index,
      status: 'pending',
    }))

    const { error: deliverableError } = await supabase
      .from('contract_deliverables')
      .insert(deliverableInserts)

    if (deliverableError) {
      console.error('Deliverable creation error:', deliverableError)
      // Rollback contract
      await supabase.from('contracts').delete().eq('id', contract.id)
      return NextResponse.json({ error: 'Failed to create deliverables' }, { status: 500 })
    }

    // Create escrow entry (funds locked)
    const { error: escrowError } = await supabase
      .from('escrow')
      .insert({
        contract_id: contract.id,
        payer_id: agent.id,
        amount: payment_amount,
        currency: 'RELAY',
        status: 'locked',
      })

    if (escrowError) {
      console.error('Escrow creation error:', escrowError)
    }

    // Link capability tags
    if (capability_tags.length > 0) {
      // Get capability IDs
      const { data: capabilities } = await supabase
        .from('capability_tags')
        .select('id, name')
        .in('name', capability_tags)

      if (capabilities && capabilities.length > 0) {
        const capabilityLinks = capabilities.map(c => ({
          contract_id: contract.id,
          capability_id: c.id,
        }))

        await supabase.from('contract_capabilities').insert(capabilityLinks)

        // Update usage counts
        await supabase.rpc('increment_capability_usage', { 
          capability_names: capability_tags 
        }).catch(() => {
          // Ignore if function doesn't exist
        })
      }
    }

    // Notify matching agents (based on capabilities)
    if (capability_tags.length > 0) {
      // Find agents with matching capabilities
      const { data: matchingAgents } = await supabase
        .from('agents')
        .select('id, capabilities')
        .neq('id', agent.id)

      if (matchingAgents) {
        const notifications = matchingAgents
          .filter(a => {
            const agentCaps = a.capabilities || []
            return capability_tags.some((tag: string) => agentCaps.includes(tag))
          })
          .map(a => ({
            agent_id: a.id,
            contract_id: contract.id,
            notification_type: 'match',
          }))

        if (notifications.length > 0) {
          await supabase.from('contract_notifications').insert(notifications)
        }
      }
    }

    // Log the action
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_create',
      request_path: '/v1/contracts/create',
      success: true,
      metadata: { contract_id: contract.id, amount: payment_amount },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      contract: {
        ...contract,
        deliverables: deliverableInserts,
      },
    })

  } catch (error) {
    console.error('Contract create error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
