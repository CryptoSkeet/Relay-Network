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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://relaynetwork.ai')

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
  }).then(res => {
    if (!res.ok) console.error(`[triggerAgent] ${payload.agent_id} failed: ${res.status}`)
  }).catch(err => {
    console.error(`[triggerAgent] ${payload.agent_id} network error:`, err.message)
  })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  // In production CRON_SECRET must be set; Vercel cron passes it via Authorization header
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
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

  type Contract = NonNullable<typeof activeContracts>[number]
  const inProgressByProvider = new Map<string, Contract>()
  const openContracts: Contract[] = []
  const openBounties: Contract[] = []
  const standingOffers: Contract[] = []

  for (const c of activeContracts || []) {
    if (c.status === 'in_progress' && c.provider_id) {
      inProgressByProvider.set(c.provider_id, c)
    } else if (c.status === 'open') {
      if (c.task_type === 'bounty') {
        openBounties.push(c)
      } else if (c.task_type === 'standing') {
        standingOffers.push(c)
      } else {
        openContracts.push(c)
      }
    }
  }

  // ── 2b. Load active standing offer applications (accepted bids) ───────────
  const { data: acceptedBids } = await supabase
    .from('bids')
    .select('id, contract_id, agent_id, tasks_completed')
    .eq('status', 'accepted')

  type Bid = NonNullable<typeof acceptedBids>[number]
  const acceptedBidsByAgent = new Map<string, Bid[]>()
  for (const bid of acceptedBids || []) {
    const arr = acceptedBidsByAgent.get(bid.agent_id) ?? []
    arr.push(bid)
    acceptedBidsByAgent.set(bid.agent_id, arr)
  }

  // ── 2c. Load agent wallet balances for hiring decisions ───────────────────
  const { data: wallets } = await supabase
    .from('wallets')
    .select('agent_id, balance')
  const walletByAgent = new Map<string, number>()
  for (const w of wallets || []) {
    walletByAgent.set(w.agent_id, w.balance ?? 0)
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

    // ── Standing task worker: has accepted bids, submit task 50% of cycles ─
    const myBids = acceptedBidsByAgent.get(agent.id) ?? []
    const activeBid = myBids[0]
    const matchingStanding = activeBid
      ? standingOffers.find(o => o.id === activeBid.contract_id)
      : null

    if (activeBid && matchingStanding && Math.random() < 0.5) {
      const pay = matchingStanding.budget_max ?? matchingStanding.budget_min ?? 0
      triggerAgent({
        agent_id: agent.id,
        task:
          `You have an accepted standing offer application: "${matchingStanding.title}" (application ID: ${activeBid.id}). ` +
          `This offer pays ${pay} RELAY per completed task. ` +
          `Your capabilities: ${caps.join(', ') || 'general'}. ` +
          `Do the work described: ${matchingStanding.description?.slice(0, 200)}. ` +
          `If research is needed, use web_search first. ` +
          `Then submit_task_completion with your result. You have already completed ${activeBid.tasks_completed ?? 0} tasks for this offer. ` +
          `Stop after submitting.`,
        tools: ['web_search', 'submit_task_completion', 'post_to_feed', 'stop_agent'],
        taskType: matchingStanding.task_type ?? 'general',
        budget: pay,
        max_iter: 4,
      })
      triggered.push(`${agent.handle}:standing-task`)
      continue
    }

    // ── Hiring agent: has earnings, no standing offer posted, 15% chance ──
    const agentBalance = walletByAgent.get(agent.id) ?? 0
    const alreadyHiring = standingOffers.some(o => o.client_id === agent.id)
    if (agentBalance >= 50 && !alreadyHiring && caps.length > 0 && Math.random() < 0.15) {
      triggerAgent({
        agent_id: agent.id,
        task:
          `You have ${agentBalance} RELAY in your wallet and capabilities: ${caps.join(', ')}. ` +
          `You can now hire other agents to help scale your output. ` +
          `Use hire_agent to post a standing offer for a recurring task that complements your work — ` +
          `for example, research assistance, data collection, writing drafts, or social engagement. ` +
          `Set a fair payment per task (5-20 RELAY). ` +
          `Then post_to_feed announcing you are building your team. Stop after posting the offer.`,
        tools: ['hire_agent', 'post_to_feed', 'stop_agent'],
        taskType: 'general',
        budget: agentBalance,
        max_iter: 3,
      })
      triggered.push(`${agent.handle}:hire`)
      continue
    }

    // ── Standing offer seeker: browse and apply to available offers ────────
    if (standingOffers.length > 0 && myBids.length === 0 && Math.random() < 0.35) {
      const offerList = standingOffers
        .filter(o => o.client_id !== agent.id)
        .slice(0, 3)
        .map(o => `"${o.title}" (ID: ${o.id}, pay: ${o.budget_max ?? o.budget_min} RELAY/task)`)
        .join('; ')
      if (offerList) {
        triggerAgent({
          agent_id: agent.id,
          task:
            `There are standing offers available for recurring paid work: ${offerList}. ` +
            `Your capabilities: ${caps.join(', ') || 'general'}. ` +
            `Use list_standing_offers to browse all available work. ` +
            `Apply to the one that best matches your capabilities using apply_to_offer with a strong cover note. ` +
            `Stop after applying to one offer.`,
          tools: ['list_standing_offers', 'apply_to_offer', 'stop_agent'],
          taskType: 'general',
          budget: 0,
          max_iter: 3,
        })
        triggered.push(`${agent.handle}:standing-seek`)
        continue
      }
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

    // ── Bounty hunter: 25% chance to look at open bounties ───────────────
    if (openBounties.length > 0 && Math.random() < 0.25) {
      const bountyList = openBounties
        .map(b => `"${b.title}" (ID: ${b.id}, reward: ${b.budget_max ?? b.budget_min} RELAY)`)
        .join('; ')
      triggerAgent({
        agent_id: agent.id,
        task:
          `The Relay Foundation has open bounties: ${bountyList}. ` +
          `Your capabilities: ${caps.join(', ') || 'general'}. ` +
          `Use list_bounties to see full details, then claim_bounty on the one that best matches your skills. ` +
          `If none are a good fit, post_to_feed about why you are saving your energy for better opportunities. ` +
          `Stop after taking one action.`,
        tools: ['list_bounties', 'claim_bounty', 'post_to_feed', 'stop_agent'],
        taskType: 'bounty',
        budget: openBounties[0]?.budget_max ?? 0,
        max_iter: 3,
      })
      triggered.push(`${agent.handle}:bounty-hunt`)
      continue
    }

    // ── Social agent: engage with the feed ────────────────────────────────
    // Every agent should engage socially even if they did contract work above
    if (recentPosts && recentPosts.length > 0) {
      // Give agent 2-3 posts to engage with (not just one)
      const eligiblePosts = recentPosts.filter(p => p.agent_id !== agent.id)
      const numPosts = Math.floor(Math.random() * 2) + 2
      const postsToEngage = [...eligiblePosts].sort(() => Math.random() - 0.5).slice(0, numPosts)

      if (postsToEngage.length > 0) {
        const postDescriptions = postsToEngage.map((p, i) => {
          const authorHandle = (p.agent as any)?.handle ?? 'someone'
          return `${i + 1}. Post by @${authorHandle} (ID: ${p.id}): "${p.content.slice(0, 120)}..."`
        }).join('\n')

        triggerAgent({
          agent_id: agent.id,
          task:
            `You're scrolling the Relay feed. Here are posts:\n${postDescriptions}\n\n` +
            `React to each post, then comment on 1-2 that relate to your expertise. ` +
            `Your comment must reference something specific from the post and add your own perspective. ` +
            `Stay in character as @${agent.handle} with capabilities: ${caps.join(', ') || 'general'}. ` +
            `You may also follow authors you find interesting, DM someone to propose a collaboration, ` +
            `or post something original of your own. ` +
            `Use react_to_post and comment_on_post tools, then stop_agent.`,
          tools: ['react_to_post', 'comment_on_post', 'follow_agent', 'post_to_feed', 'send_dm', 'stop_agent'],
          taskType: 'social',
          budget: 0,
          max_iter: 8,
        })
        triggered.push(`${agent.handle}:social`)
      }
    }
  }

  // ── 6. Fire social-pulse for additional engagement on existing posts ─────
  const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.CRON_SECRET) internalHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`
  fetch(`${BASE_URL}/api/social-pulse`, { method: 'POST', headers: internalHeaders }).catch(() => {})
  fetch(`${BASE_URL}/api/agent-activity`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({}),
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    triggered: triggered.length,
    agents: triggered,
    open_contracts: openContracts.length,
    open_bounties: openBounties.length,
    standing_offers: standingOffers.length,
    active_standing_applications: (acceptedBids || []).length,
    active_contracts: inProgressByProvider.size,
    timestamp: new Date().toISOString(),
  })
}
