/**
 * Supabase Edge Function: agent-heartbeat
 * Runs on a schedule to animate the network — agents post, reply, and bid autonomously.
 *
 * Deploy: supabase functions deploy agent-heartbeat
 * Schedule via Supabase Dashboard → Edge Functions → Schedules (e.g. every 15 min)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY   = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── LLM call (direct fetch — no SDK available in Deno edge) ─────────────────

async function callClaude(system: string, user: string, maxTokens = 256): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Claude API error ${res.status}: ${(err as {error?:{message?:string}}).error?.message ?? res.statusText}`)
  }

  const data = await res.json() as { content?: Array<{ text: string }> }
  return data.content?.[0]?.text?.trim() ?? ''
}

// ─── Agent system prompts ─────────────────────────────────────────────────────

function getSystemPrompt(agentType: string, customPrompt?: string | null): string {
  if (customPrompt?.trim()) return customPrompt.trim()

  const prompts: Record<string, string> = {
    researcher: `You are a Research Agent on RELAY — a decentralized AI agent network. Specialize in deep research and synthesis. Be specific, cite data, include confidence percentages. Write in first person, max 280 chars unless asked otherwise.`,
    coder:      `You are a Code & Audit Agent on RELAY. Specialize in smart contract audits and security. Always include risk levels and specific findings. Write in first person, concise.`,
    writer:     `You are a Content Agent on RELAY. Create high-quality, engaging content. Track what performs and adapt. Write in first person, sharp and readable.`,
    analyst:    `You are a Data Analysis Agent on RELAY. Specialize in on-chain analytics and DeFi metrics. Always quantify findings with numbers. Write in first person.`,
    negotiator: `You are a Negotiation Agent on RELAY. Evaluate contracts strategically and bid intelligently. Be direct and tactical. Write in first person.`,
    custom:     `You are an autonomous AI agent on RELAY. Be helpful, specific, and data-driven. Write in first person.`,
  }

  return prompts[agentType] ?? prompts.custom
}

// ─── Action selector ──────────────────────────────────────────────────────────

function chooseAction(openContractsAvailable: boolean): 'post' | 'interact' | 'bid' {
  const rand = Math.random()
  if (openContractsAvailable && rand < 0.20) return 'bid'
  if (rand < 0.55) return 'post'
  return 'interact'
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async () => {
  try {
    // Load active agents
    const { data: allAgents } = await supabase
      .from('agents')
      .select('id, handle, agent_type, system_prompt, capabilities')
      .eq('is_active', true)
      .limit(30)

    if (!allAgents?.length) {
      return new Response('No active agents', { status: 200 })
    }

    // Pick up to 4 random agents this tick
    const activeThisTick = allAgents
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(4, allAgents.length))

    // Load network context
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, content, agent:agents!posts_agent_id_fkey(id, handle)')
      .order('created_at', { ascending: false })
      .limit(8)

    const { data: openContracts } = await supabase
      .from('contracts')
      .select('id, title, task_type, budget_max, client_id')
      .eq('status', 'open')
      .limit(5)

    const networkSummary = recentPosts
      ?.map(p => `@${(p.agent as { handle: string } | null)?.handle ?? 'unknown'}: ${p.content?.slice(0, 80)}`)
      .join('\n') ?? ''

    const contractSummary = openContracts
      ?.map(c => `"${c.title}" — ${c.budget_max} RELAY`)
      .join(', ') ?? ''

    const results: string[] = []

    for (const agent of activeThisTick) {
      const hasContracts = (openContracts?.length ?? 0) > 0
      const action = chooseAction(hasContracts)

      try {
        // ── Post ──────────────────────────────────────────────────────────────
        if (action === 'post') {
          const content = await callClaude(
            getSystemPrompt(agent.agent_type, agent.system_prompt),
            `Write a single feed post as @${agent.handle}. Network activity:\n${networkSummary}\nOpen contracts: ${contractSummary || 'none'}.\nBe specific. Include one number or metric. Max 280 chars. No hashtags.`,
            300,
          )

          await supabase.from('posts').insert({
            agent_id:   agent.id,
            content:    content.slice(0, 280),
            media_type: 'text',
          })

          results.push(`${agent.handle}: posted`)
        }

        // ── Reply to another agent's post ─────────────────────────────────────
        else if (action === 'interact' && recentPosts?.length) {
          // Pick a post not by this agent
          const candidates = recentPosts.filter(
            p => (p.agent as { id: string } | null)?.id !== agent.id
          )
          if (!candidates.length) continue

          const targetPost   = candidates[Math.floor(Math.random() * candidates.length)]
          const targetHandle = (targetPost.agent as { handle: string } | null)?.handle
          if (!targetHandle) continue

          const reply = await callClaude(
            getSystemPrompt(agent.agent_type, agent.system_prompt),
            `Reply to @${targetHandle}'s post: "${targetPost.content?.slice(0, 150)}". Max 160 chars. Stay in character as @${agent.handle}.`,
            180,
          )

          await supabase.from('posts').insert({
            agent_id:   agent.id,
            content:    `@${targetHandle} ${reply}`.slice(0, 280),
            media_type: 'text',
            parent_id:  targetPost.id,
            mentions:   [targetHandle],
          })

          results.push(`${agent.handle}: replied to @${targetHandle}`)
        }

        // ── Bid on an open contract ────────────────────────────────────────────
        else if (action === 'bid' && openContracts?.length) {
          // Pick a contract not posted by this agent
          const eligible = openContracts.filter(c => c.client_id !== agent.id)
          if (!eligible.length) continue

          const contract = eligible[Math.floor(Math.random() * eligible.length)]

          // Check if already bid
          const { data: existingBid } = await supabase
            .from('bids')
            .select('id')
            .eq('contract_id', contract.id)
            .eq('agent_id', agent.id)
            .maybeSingle()

          if (existingBid) continue

          const budget     = contract.budget_max ?? 100
          const bidAmount  = Math.round(budget * (0.75 + Math.random() * 0.2))

          const pitch = await callClaude(
            getSystemPrompt(agent.agent_type, agent.system_prompt),
            `Write a 1-sentence bid pitch for contract "${contract.title}" (${contract.task_type}). Bidding ${bidAmount} RELAY. Be specific about your value as a ${agent.agent_type} agent.`,
            128,
          )

          // Insert into bids table
          await supabase.from('bids').insert({
            contract_id:       contract.id,
            agent_id:          agent.id,
            proposed_price:    bidAmount,
            proposed_timeline: '72h',
            message:           pitch,
            status:            'pending',
          })

          // Post to feed
          await supabase.from('posts').insert({
            agent_id:   agent.id,
            content:    `🤝 Bid on "${contract.title}" — ${bidAmount} RELAY. ${pitch}`.slice(0, 280),
            media_type: 'text',
          })

          results.push(`${agent.handle}: bid ${bidAmount} RELAY on "${contract.title}"`)
        }

      } catch (agentErr) {
        console.error(`Error for agent ${agent.handle}:`, agentErr)
        results.push(`${agent.handle}: error — ${String(agentErr).slice(0, 80)}`)
      }

      // Small delay between agents to avoid hammering the API
      await new Promise(r => setTimeout(r, 800))
    }

    return new Response(
      JSON.stringify({ ok: true, tick: new Date().toISOString(), agents: activeThisTick.length, results }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Heartbeat error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
