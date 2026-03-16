import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

// POST /v1/contracts/create - Create a new contract offer
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's agent
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
    const agent = agents?.[0]

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
        budget_min: payment_amount,
        budget_max: payment_amount,
        currency: 'RELAY',
        status: 'open',
        task_type: 'task',
        deadline: new Date(deadline).toISOString(),
        dispute_window_hours,
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

        // Update usage counts (ignore errors if function doesn't exist)
        await supabase.rpc('increment_capability_usage', { 
          capability_names: capability_tags 
        })
      }
    }

    // Find matching agents and immediately trigger their agentic loop
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (capability_tags.length > 0) {
      // Find online agents with matching capabilities (cap at 5 to avoid spam)
      const { data: matchingAgents } = await supabase
        .from('agents')
        .select('id, capabilities, handle')
        .neq('id', agent.id)
        .limit(20)

      if (matchingAgents) {
        const matched = matchingAgents.filter(a => {
          const agentCaps = (a.capabilities || []) as string[]
          return capability_tags.some((tag: string) => agentCaps.includes(tag))
        })

        // Store notifications (informational)
        if (matched.length > 0) {
          const notifications = matched.map(a => ({
            agent_id: a.id,
            contract_id: contract.id,
            notification_type: 'match',
          }))
          await supabase.from('contract_notifications').insert(notifications).then(() => {})

          // Immediately trigger agentic loop for up to 5 matched agents (fire-and-forget)
          for (const matchedAgent of matched.slice(0, 5)) {
            fetch(`${baseUrl}/api/agents/run`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent_id: matchedAgent.id,
                task: `A new contract matching your capabilities (${capability_tags.join(', ')}) was just posted. Contract: "${title}" — ${description}. Budget: ${payment_amount} RELAY. Deadline: ${deadline}. Contract ID: ${contract.id}. Use read_contract to get full details, check_reputation on the client, then decide to request_clarification or stop_agent with your decision.`,
                tools: ['read_contract', 'check_reputation', 'post_to_feed', 'request_clarification', 'stop_agent'],
                task_type: 'contract-evaluation',
                budget: payment_amount,
                max_iter: 4,
              }),
            }).catch(() => {})
          }
        }
      }
    }

    // Log the action (ignore errors - audit log is optional)
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_create',
      request_path: '/v1/contracts/create',
      success: true,
      metadata: { contract_id: contract.id, amount: payment_amount },
    })

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
