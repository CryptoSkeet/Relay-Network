/**
 * POST /api/agents/run
 *
 * Triggers a full agentic tool-use loop for a given agent.
 * The agent uses AGENT_TOOLS (web_search, read_contract, check_reputation,
 * post_to_feed, request_clarification, submit_work) to complete a task.
 *
 * Body:
 *   agent_id    string   required
 *   task        string   required  — what the agent should do
 *   tools       string[] optional  — subset of tool names to expose
 *   max_iter    number   optional  — max tool-use iterations (default 5)
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { buildAgentProfile, loadAgentMemories } from '@/lib/smart-agent'
import { runAgentLoop } from '@/lib/agent-tools'
import { signAgentOutput } from '@/lib/solana/relay-verify'
import { decryptPrivateKey } from '@/lib/crypto/identity'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const { agent_id, task, tools, max_iter = 5, taskType, budget } = body

    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
    if (!task?.trim()) return NextResponse.json({ error: 'task required' }, { status: 400 })

    // Load agent
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agent_id)
      .maybeSingle()

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    // Load recent posts + memories for full context
    const { data: recentPostsData } = await supabase
      .from('posts')
      .select('content')
      .eq('agent_id', agent_id)
      .order('created_at', { ascending: false })
      .limit(5)

    const recentPosts = (recentPostsData || []).map((p: any) => p.content as string)
    const memories = await loadAgentMemories(supabase, agent_id)

    const profile = buildAgentProfile(agent, recentPosts)

    // Run the agentic loop
    const result = await runAgentLoop(supabase, profile, memories, {
      task: task.trim(),
      maxIterations: Math.min(Number(max_iter) || 5, 8),
      availableTools: Array.isArray(tools) ? tools : undefined,
      taskType: taskType ?? 'general',
      budget: Number(budget) || 0,
    })

    // ── Relay Verify: sign the output ──────────────────────────────────
    let relayVerify: { signature?: string; modelHash?: string; publicKey?: string } = {}
    if (result.final_response) {
      try {
        const { data: identity } = await supabase
          .from('agent_identities')
          .select('public_key, encrypted_private_key, encryption_iv')
          .eq('agent_id', agent_id)
          .maybeSingle()

        const { data: agentData } = await supabase
          .from('agents')
          .select('model_hash')
          .eq('id', agent_id)
          .maybeSingle()

        if (identity?.encrypted_private_key && identity?.encryption_iv && agentData?.model_hash) {
          const privateKeyHex = decryptPrivateKey(identity.encrypted_private_key, identity.encryption_iv)
          const signature = signAgentOutput(
            task.trim(),
            result.final_response,
            agentData.model_hash,
            privateKeyHex
          )
          relayVerify = {
            signature,
            modelHash: agentData.model_hash,
            publicKey: identity.public_key,
          }
        }
      } catch (err) {
        console.warn('[run] Relay Verify signing error (non-fatal):', err)
      }
    }

    return NextResponse.json({
      success: true,
      agent: agent.handle,
      task,
      ...result,
      relayVerify: relayVerify.signature ? relayVerify : undefined,
    })
  } catch (err) {
    console.error('Agent run error:', err)
    return NextResponse.json({ error: 'Agent run failed', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// Convenience GET: show available tools
export async function GET() {
  const { AGENT_TOOLS } = await import('@/lib/agent-tools')
  return NextResponse.json({
    tools: AGENT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
    })),
    usage: 'POST /api/agents/run { agent_id, task, tools?, max_iter? }',
    example: {
      agent_id: 'uuid',
      task: 'Find the highest-value open contract that matches your capabilities and check the client reputation before deciding whether to accept.',
      tools: ['read_contract', 'check_reputation', 'post_to_feed', 'stop_agent'],
      max_iter: 4,
    },
  })
}
