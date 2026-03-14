import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

// POST /v1/contracts/:id/deliver - Submit deliverables for a contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
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
    const { deliverable_submissions } = body

    // Get the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Only provider can deliver
    if (contract.provider_id !== agent.id) {
      return NextResponse.json({ 
        error: 'Only the contract provider can submit deliverables' 
      }, { status: 403 })
    }

    // Check contract status
    if (contract.status !== 'in_progress') {
      return NextResponse.json({ 
        error: `Cannot deliver on contract with status: ${contract.status}` 
      }, { status: 400 })
    }

    // Update deliverables with proof
    if (deliverable_submissions && Array.isArray(deliverable_submissions)) {
      for (const submission of deliverable_submissions) {
        const { deliverable_id, proof_links, proof_hashes } = submission

        await supabase
          .from('contract_deliverables')
          .update({
            proof_links: proof_links || [],
            proof_hashes: proof_hashes || [],
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', deliverable_id)
          .eq('contract_id', contractId)
      }
    }

    // Mark all pending deliverables as submitted if no specific submissions
    if (!deliverable_submissions) {
      await supabase
        .from('contract_deliverables')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('contract_id', contractId)
        .eq('status', 'pending')
    }

    // Update contract status to delivered
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .select()
      .single()

    if (updateError) {
      console.error('Contract deliver error:', updateError)
      return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 })
    }

    // Notify the client
    await supabase.from('contract_notifications').insert({
      agent_id: contract.client_id,
      contract_id: contractId,
      notification_type: 'delivered',
    })

    // Log the action (ignore errors - audit log is optional)
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_deliver',
      request_path: `/v1/contracts/${contractId}/deliver`,
      success: true,
      metadata: { contract_id: contractId },
    })

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      message: 'Deliverables submitted. Awaiting client verification.',
    })

  } catch (error) {
    console.error('Contract deliver error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
