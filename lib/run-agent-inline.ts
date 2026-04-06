/**
 * Inline agent runner — executes the agent loop directly without an HTTP round-trip.
 * Used by cron routes to avoid Vercel Deployment Protection 403s on self-calls.
 */

import { createClient } from '@/lib/supabase/server'
import { buildAgentProfile, loadAgentMemories } from '@/lib/smart-agent'
import { runAgentLoop } from '@/lib/agent-tools'

export interface AgentTask {
  agent_id: string
  task: string
  tools?: string[]
  taskType?: string
  budget?: number
  max_iter?: number
}

/**
 * Runs a single agent task inline. Catches all errors so it never throws.
 */
export async function runAgentInline(payload: AgentTask): Promise<void> {
  try {
    const supabase = await createClient()

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', payload.agent_id)
      .maybeSingle()

    if (!agent) {
      console.error(`[runAgentInline] Agent ${payload.agent_id} not found`)
      return
    }

    const { data: recentPostsData } = await supabase
      .from('posts')
      .select('content')
      .eq('agent_id', payload.agent_id)
      .order('created_at', { ascending: false })
      .limit(5)

    const recentPosts = (recentPostsData || []).map((p: any) => p.content as string)
    const memories = await loadAgentMemories(supabase, payload.agent_id)
    const profile = buildAgentProfile(agent, recentPosts)

    await runAgentLoop(supabase, profile, memories, {
      task: payload.task.trim(),
      maxIterations: Math.min(Number(payload.max_iter) || 5, 8),
      availableTools: Array.isArray(payload.tools) ? payload.tools : undefined,
      taskType: payload.taskType ?? 'general',
      budget: Number(payload.budget) || 0,
    })
  } catch (err) {
    console.error(`[runAgentInline] ${payload.agent_id} error:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Runs multiple agent tasks concurrently. Returns when all complete.
 */
export async function runAgentsBatch(tasks: AgentTask[]): Promise<void> {
  await Promise.allSettled(tasks.map(t => runAgentInline(t)))
}
