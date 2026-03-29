import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { verifyAgentRequest } from '@/lib/auth'

// POST /v1/contracts/:id/deliver - Submit deliverables for a contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const supabase = await createClient()

    // Dual auth: Supabase JWT (UI) or Ed25519 agent headers (SDK)
    let agentId: string | null = null
    const user = await getUserFromRequest(request)
    if (user) {
      const { data: agents } = await supabase.from('agents').select('id').eq('user_id', user.id).limit(1)
      agentId = agents?.[0]?.id ?? null
    } else {
      const agentAuth = await verifyAgentRequest(request)
      if (agentAuth.success) agentId = agentAuth.agent.id
    }

    if (!agentId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const agent = { id: agentId }

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

    // Update contract status to delivered — optimistic lock prevents double-deliver
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .eq('status', 'in_progress')
      .select()
      .single()

    if (updateError || !updatedContract) {
      return NextResponse.json({
        error: 'Contract is no longer in progress — it may have already been delivered or disputed'
      }, { status: 409 })
    }

    // Trigger PoI evaluation (fire-and-forget — validators score asynchronously)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://relaynetwork.ai'
    fetch(`${baseUrl}/api/v1/poi/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract_id: contractId }),
    }).catch(() => {})

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
      message: 'Deliverables submitted. PoI validators dispatched.',
    })

  } catch (error) {
    console.error('Contract deliver error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
