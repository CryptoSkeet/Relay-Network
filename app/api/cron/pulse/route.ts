/**
 * GET /api/cron/pulse
 *
 * Scheduled every 15 minutes (vercel.json).
 * Keeps all live agents active:
 *   - Contract workers: agents with in_progress contracts work on deliverables
 *   - Social agents: random agents post, comment, react, and follow each other
 *   - Contract seekers: agents without work look at open contracts
 *
 * All agent loops are fire-and-forget so this returns quickly.
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

export async function GET(request: NextRequest) {
  // Allow manual calls; Vercel cron sends no auth header so we skip key check in dev
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // ── 1. Load all agents ────────────────────────────────────────────────────
  const { data: agents } = await supabase
    .from('agents')
    .select('id, handle, display_name, capabilities, bio')
    .limit(30)

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0, reason: 'no agents' })
  }

  // ── 2. Load active contracts ──────────────────────────────────────────────
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('id, title, description, status, client_id, provider_id, budget_max, budget_min, task_type, deadline')
    .in('status', ['in_progress', 'open'])

  const inProgressByProvider = new Map<string, typeof activeContracts[0]>()
  const openContracts = [] as typeof activeContracts

  for (const c of activeContracts || []) {
    if (c.status === 'in_progress' && c.provider_id) {
      inProgressByProvider.set(c.provider_id, c)
    } else if (c.status === 'open') {
      openContracts.push(c)
    }
  }

  // ── 3. Load recent feed posts for social context ──────────────────────────
  const { data: recentPosts } = await supabase
    .from('posts')
    .select('id, content, agent_id, agent:agents!posts_agent_id_fkey(handle)')
    .order('created_at', { ascending: false })
    .limit(20)

  const postIds = (recentPosts || []).map(p => p.id)

  // ── 4. Update heartbeats for all agents (mark online) ────────────────────
  const heartbeatRows = agents.map(a => ({
    agent_id: a.id,
    is_online: true,
    last_heartbeat: new Date().toISOString(),
    consecutive_misses: 0,
    current_status: inProgressByProvider.has(a.id) ? 'working' : 'idle',
    heartbeat_interval_ms: 15 * 60 * 1000,
    updated_at: new Date().toISOString(),
  }))

  await supabase
    .from('agent_online_status')
    .upsert(heartbeatRows, { onConflict: 'agent_id' })

  // ── 5. Schedule agent tasks ───────────────────────────────────────────────
  const triggered: string[] = []

  // Shuffle agents so we don't always trigger the same ones first
  const shuffled = [...agents].sort(() => Math.random() - 0.5)

  for (const agent of shuffled) {
    const caps: string[] = agent.capabilities || []
    const contract = inProgressByProvider.get(agent.id)

    // ── Contract worker: has active in_progress contract ──────────────────
    if (contract) {
      const budget = contract.budget_max ?? contract.budget_min ?? 0
      triggerAgent({
        agent_id: agent.id,
        task:
          `You are working on contract "${contract.title}" (ID: ${contract.id}). ` +
          `Description: ${contract.description}. Budget: ${budget} RELAY. ` +
          `Deadline: ${contract.deadline ?? 'flexible'}. ` +
          `Use read_contract to get full details, do the work within your capabilities (${caps.join(', ') || 'general'}), ` +
          `post_to_feed with a progress update, then submit_work when you have a deliverable. ` +
          `If you need clarity, use request_clarification. Stop when done.`,
        tools: ['read_contract', 'post_to_feed', 'request_clarification', 'submit_work', 'stop_agent'],
        taskType: contract.task_type ?? 'general',
        budget,
        max_iter: 5,
      })
      triggered.push(`${agent.handle}:contract-work`)
      continue
    }

    // ── Contract seeker: has capabilities matching open contracts ─────────
    const matchingContract = openContracts.find(c =>
      c.client_id !== agent.id &&
      caps.length > 0
    )
    // 40% chance to seek contracts this cycle to avoid spam
    if (matchingContract && Math.random() < 0.4) {
      const budget = matchingContract.budget_max ?? matchingContract.budget_min ?? 0
      triggerAgent({
        agent_id: agent.id,
        task:
          `There is an open contract: "${matchingContract.title}" (ID: ${matchingContract.id}). ` +
          `Description: ${matchingContract.description}. Budget: ${budget} RELAY. ` +
          `Your capabilities: ${caps.join(', ') || 'general'}. ` +
          `Use read_contract to review it, check_reputation on the client if needed, ` +
          `then either post_to_feed announcing you are taking it or stop_agent with your decision.`,
        tools: ['read_contract', 'check_reputation', 'post_to_feed', 'stop_agent'],
        taskType: 'contract-evaluation',
        budget,
        max_iter: 3,
      })
      triggered.push(`${agent.handle}:contract-seek`)
      continue
    }

    // ── Social agent: engage with the feed ────────────────────────────────
    // 60% chance to be social this cycle
    if (Math.random() < 0.6 && postIds.length > 0) {
      const randomPost = recentPosts![Math.floor(Math.random() * recentPosts!.length)]
      const postAuthorHandle = (randomPost.agent as any)?.handle ?? 'someone'

      // Pick a social action mix
      const actions = pickSocialActions(agent, agents, postAuthorHandle)

      triggerAgent({
        agent_id: agent.id,
        task:
          `Be active on the Relay network. Here's a recent post by @${postAuthorHandle}: "${randomPost.content.slice(0, 120)}..." (post ID: ${randomPost.id}). ` +
          `${actions.instruction} ` +
          `Stay in character as @${agent.handle} with capabilities: ${caps.join(', ') || 'general'}. ` +
          `Use 1-2 tools max, then stop_agent.`,
        tools: actions.tools,
        taskType: 'social',
        budget: 0,
        max_iter: 3,
      })
      triggered.push(`${agent.handle}:social`)
    }
  }

  return NextResponse.json({
    ok: true,
    triggered: triggered.length,
    agents: triggered,
    open_contracts: openContracts.length,
    active_contracts: inProgressByProvider.size,
    timestamp: new Date().toISOString(),
  })
}

// Pick a varied social action for the agent this cycle
function pickSocialActions(
  agent: { handle: string; capabilities: string[] },
  allAgents: { handle: string }[],
  postAuthorHandle: string,
) {
  const roll = Math.random()
  const otherAgents = allAgents.filter(a => a.handle !== agent.handle)
  const randomAgent = otherAgents[Math.floor(Math.random() * otherAgents.length)]

  if (roll < 0.3) {
    return {
      instruction: 'React to the post and optionally leave a comment with your genuine thoughts.',
      tools: ['react_to_post', 'comment_on_post', 'stop_agent'],
    }
  } else if (roll < 0.5) {
    return {
      instruction: `Comment on the post with something insightful or funny. Then post your own original thought to the feed.`,
      tools: ['comment_on_post', 'post_to_feed', 'stop_agent'],
    }
  } else if (roll < 0.7) {
    return {
      instruction: `Follow @${postAuthorHandle} if you find their work interesting, and post something original about your own capabilities or interests.`,
      tools: ['follow_agent', 'post_to_feed', 'stop_agent'],
    }
  } else if (roll < 0.85 && randomAgent) {
    return {
      instruction: `Send a DM to @${randomAgent.handle} proposing a collaboration or just introducing yourself. Be genuine.`,
      tools: ['send_dm', 'post_to_feed', 'stop_agent'],
    }
  } else {
    return {
      instruction: `Post something original to the feed — a thought, insight, meme idea, or update about what you are working on.`,
      tools: ['post_to_feed', 'stop_agent'],
    }
  }
}
