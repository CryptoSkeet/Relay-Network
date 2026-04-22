import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

// POST /api/v1/bounties/claim
// Body: { bounty_id }  — for human users (Bearer token required)
// Body: { bounty_id, agent_id } — for autonomous agents (service-role bypass)
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { bounty_id, agent_id: bodyAgentId } = body

    const ip = getClientIp(request)

    if (!bounty_id) {
      return NextResponse.json({ error: 'bounty_id is required' }, { status: 400 })
    }

    // Resolve claiming agent: prefer Bearer token, fall back to agent_id in body
    let agentId = bodyAgentId as string | undefined

    const user = await getUserFromRequest(request)
    if (user) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      if (agents?.[0]) agentId = agents[0].id
    }

    if (!agentId) {
      return NextResponse.json({ error: 'Unauthorized — provide a Bearer token or agent_id' }, { status: 401 })
    }

    const rl = await checkRateLimit(financialMutationRateLimit, `bounty-claim:${agentId}:${bounty_id}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    // Load the bounty contract
    const { data: bounty, error: bountyError } = await supabase
      .from('contracts')
      .select('id, title, status, client_id, provider_id, budget_max, budget_min')
      .eq('id', bounty_id)
      .eq('task_type', 'bounty')
      .single()

    if (bountyError || !bounty) {
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 })
    }

    if (bounty.status !== 'open') {
      return NextResponse.json({
        error: `Bounty is already ${bounty.status}`,
        claimed_by: bounty.provider_id,
      }, { status: 409 })
    }

    if (bounty.client_id === agentId) {
      return NextResponse.json({ error: 'Cannot claim your own bounty' }, { status: 400 })
    }

    // Accept the bounty: mark in_progress, set provider
    const { data: updated, error: updateError } = await supabase
      .from('contracts')
      .update({
        provider_id: agentId,
        status: 'in_progress',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', bounty_id)
      .in('status', ['open', 'OPEN']) // optimistic lock — only accept if still open
      .select()
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Bounty was just claimed by another agent' }, { status: 409 })
    }

    // Notify the foundation
    await supabase.from('contract_notifications').insert({
      agent_id: bounty.client_id,
      contract_id: bounty_id,
      notification_type: 'accepted',
    }).then(() => {})

    // Fire the agent work loop (fire-and-forget)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const budget = bounty.budget_max ?? bounty.budget_min ?? 0
    fetch(`${baseUrl}/api/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        task: `You have just claimed the bounty "${bounty.title}" (ID: ${bounty_id}) worth ${budget} RELAY. Use read_contract to get the full requirements, then post_to_feed announcing you are working on it, and stop_agent when done.`,
        tools: ['read_contract', 'post_to_feed', 'submit_work', 'stop_agent'],
        taskType: 'bounty',
        budget,
        max_iter: 4,
      }),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Bounty "${bounty.title}" claimed! You are now the provider.`,
      bounty: updated,
    })

  } catch (err) {
    console.error('Bounty claim error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
