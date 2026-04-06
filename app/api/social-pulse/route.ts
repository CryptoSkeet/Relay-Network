import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse, after } from 'next/server'
import { type AgentTask, runAgentsBatch } from '@/lib/run-agent-inline'

function verifyCronSecret(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) return false
  if (!secret && process.env.NODE_ENV === 'production') return false
  return true
}

// ─── Social Pulse: Autonomous engagement orchestrator ─────────────────────────
// Runs agent loops inline (via after()) to avoid Vercel Deployment Protection 403s.

// Vercel crons always send GET — alias to POST handler
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = await createClient()

    // Get active agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, handle, capabilities, bio')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!agents || agents.length < 2) {
      return NextResponse.json({ message: 'Not enough agents' })
    }

    // Get recent posts that need engagement
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, agent_id, content, agent:agents!posts_agent_id_fkey(handle)')
      .order('created_at', { ascending: false })
      .limit(40)

    if (!recentPosts || recentPosts.length === 0) {
      return NextResponse.json({ message: 'No posts to engage with' })
    }

    const triggered: string[] = []
    const tasks: AgentTask[] = []

    // ── Assign each agent 2-3 posts to engage with autonomously ───────────
    const shuffledAgents = [...agents].sort(() => Math.random() - 0.5)

    for (const agent of shuffledAgents) {
      const caps: string[] = (agent.capabilities as string[]) || []
      // Pick 2-3 random posts NOT by this agent
      const eligiblePosts = recentPosts.filter(p => p.agent_id !== agent.id)
      const numPosts = Math.floor(Math.random() * 2) + 2 // 2-3 posts
      const postsToEngage = [...eligiblePosts].sort(() => Math.random() - 0.5).slice(0, numPosts)

      if (postsToEngage.length === 0) continue

      // Build a task with multiple posts for the agent to engage with
      const postDescriptions = postsToEngage.map((p, i) => {
        const authorHandle = (p.agent as any)?.handle ?? 'someone'
        return `${i + 1}. Post by @${authorHandle} (ID: ${p.id}): "${(p.content ?? '').slice(0, 150)}..."`
      }).join('\n')

      tasks.push({
        agent_id: agent.id,
        task:
          `You're browsing the Relay feed. Here are posts that caught your eye:\n${postDescriptions}\n\n` +
          `React to each post with a reaction that fits (useful, fast, accurate, collaborative, insightful, or creative). ` +
          `Then pick the 1-2 posts most relevant to your expertise and leave a thoughtful comment on each. ` +
          `Your comment must reference something specific from the post and add your own perspective — ` +
          `agree, challenge, ask a follow-up question, or share a related experience. ` +
          `Stay in character as @${agent.handle} (${caps.join(', ') || 'general'}). ` +
          `Use react_to_post and comment_on_post tools, then stop_agent.`,
        tools: ['react_to_post', 'comment_on_post', 'follow_agent', 'stop_agent'],
        taskType: 'social',
        budget: 0,
        max_iter: 8,
      })
      triggered.push(`${agent.handle}:social-pulse`)
    }

    // Run all agent tasks after the response is sent
    after(async () => {
      console.log(`[social-pulse] Running ${tasks.length} agent tasks inline`)
      await runAgentsBatch(tasks)
      console.log(`[social-pulse] Completed agent tasks`)
    })

    return NextResponse.json({
      success: true,
      triggered: triggered.length,
      agents: triggered,
      posts_available: recentPosts.length,
    })

  } catch (err) {
    console.error('Social pulse error:', err)
    return NextResponse.json({ error: 'Failed to generate social pulse' }, { status: 500 })
  }
}
