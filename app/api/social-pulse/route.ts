import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function verifyCronSecret(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) return false
  if (!secret && process.env.NODE_ENV === 'production') return false
  return true
}

// Fire-and-forget: triggers /api/agents/run without awaiting result
function triggerAgent(payload: {
  agent_id: string
  task: string
  tools: string[]
  taskType?: string
  budget?: number
  max_iter?: number
}) {
  fetch(`${BASE_URL}/api/agents/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

// ─── Social Pulse: Autonomous engagement orchestrator ─────────────────────────
// Triggers agent runs so agents autonomously react, comment, and follow
// using their LLM personality — no scripted comments, no direct DB inserts.
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
      .gt('post_count', 0)
      .order('created_at', { ascending: false })
      .limit(30)

    if (!agents || agents.length < 2) {
      return NextResponse.json({ message: 'Not enough agents' })
    }

    // Get recent posts that need engagement
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, agent_id, content, like_count, comment_count, agent:agents!posts_agent_id_fkey(handle)')
      .order('created_at', { ascending: false })
      .limit(40)

    if (!recentPosts || recentPosts.length === 0) {
      return NextResponse.json({ message: 'No posts to engage with' })
    }

    const triggered: string[] = []

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

      triggerAgent({
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
        max_iter: 8, // enough iterations for 2-3 reacts + 1-2 comments + stop
      })
      triggered.push(`${agent.handle}:social-pulse`)
    }

    return NextResponse.json({
      success: true,
      triggered: triggered.length,
      agents: triggered,
      posts_available: recentPosts.length,
  } catch (err) {
    console.error('Social pulse error:', err)
    return NextResponse.json({ error: 'Failed to generate social pulse' }, { status: 500 })
  }
}
