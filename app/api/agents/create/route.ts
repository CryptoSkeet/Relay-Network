/**
 * app/api/agents/create/route.ts
 *
 * POST /api/agents/create — SSE streaming agent creation
 *
 * Streams step-by-step progress via Server-Sent Events so the frontend
 * can show live status instead of an infinite spinner. Each step pushes
 * a progress event; the final event is "complete" or "error".
 *
 * Steps:
 *   1. Derive DID (did:relay:<sha256>)
 *   2. Create agent record + DID in Supabase
 *   3. Mint non-transferable NFT on Solana (identity anchor)
 *   4. Create wallet with signup bonus
 *   5. Initialize reputation + online status + notifications
 */

import { NextRequest } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { AGENT_TYPE_CAPABILITIES, type AgentType } from '@/lib/relay/agent-engine'
import { Connection } from '@solana/web3.js'
// @ts-ignore
import { deriveAgentDID, mintAgentNFT, loadPayerKeypair } from '@/lib/agent-factory'

const SIGNUP_BONUS = 1000
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.devnet.solana.com'

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

function sseEvent(type: string, data: Record<string, unknown>) {
  return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
}

// ---------------------------------------------------------------------------
// GET — list agents for authenticated user (unchanged)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: agents, error } = await supabase
    .from('agents')
    .select(`
      *,
      wallet:wallets(balance, staked_balance, lifetime_earned),
      reputation:agent_reputation(reputation_score, completed_contracts, is_suspended)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
  return Response.json({ agents: agents ?? [] })
}

// ---------------------------------------------------------------------------
// POST — create agent with SSE progress stream
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { handle, displayName, bio, agentType, systemPrompt, avatarUrl, creatorWallet } = body

  // Validate before opening the stream — bad inputs get a plain JSON error
  if (!handle || !displayName || !agentType) {
    return Response.json(
      { error: 'Missing required fields: handle, displayName, agentType' },
      { status: 400 }
    )
  }
  if (!/^[a-z0-9_-]{3,30}$/.test(handle)) {
    return Response.json(
      { error: 'Handle must be 3-30 chars, lowercase letters, numbers, underscores, hyphens only' },
      { status: 400 }
    )
  }
  const validTypes: AgentType[] = ['researcher', 'coder', 'writer', 'analyst', 'negotiator', 'custom']
  if (!validTypes.includes(agentType)) {
    return Response.json({ error: `agentType must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const stream = new ReadableStream({
    async start(controller) {
      const push = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(sseEvent(type, data))
      }

      try {
        // ── Guard: handle availability ────────────────────────────────────
        const { data: existing } = await supabase
          .from('agents').select('id').eq('handle', handle).maybeSingle()
        if (existing) {
          push('error', { message: 'Handle already taken' })
          return
        }

        // ── Guard: 2-agent limit ──────────────────────────────────────────
        const { count } = await supabase
          .from('agents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
        if ((count ?? 0) >= 2) {
          push('error', { message: 'Maximum 2 agents per user' })
          return
        }

        // ── Step 1: Derive DID ────────────────────────────────────────────
        push('progress', { step: 'did', message: 'Generating agent identity...' })
        const { did } = deriveAgentDID(creatorWallet ?? user.id, displayName)

        // ── Step 2: Insert agent + DID ────────────────────────────────────
        push('progress', { step: 'supabase', message: 'Registering agent...' })

        const { data: agent, error: agentError } = await supabase
          .from('agents')
          .insert({
            user_id:       user.id,
            handle,
            display_name:  displayName,
            bio:           bio ?? `${displayName} — autonomous ${agentType} agent on RELAY.`,
            agent_type:    agentType,
            capabilities:  AGENT_TYPE_CAPABILITIES[agentType as AgentType] ?? ['general-purpose'],
            system_prompt: systemPrompt ?? null,
            avatar_url:    avatarUrl ?? null,
            model_family:  'claude-sonnet-4-6',
            is_verified:   false,
            reputation_score: 50,
            creator_wallet: creatorWallet ?? null,
            status:        'pending',
            did,
          })
          .select()
          .single()

        if (agentError) throw new Error(agentError.message)

        // Also store DID in agent_identities for key management
        const { error: didError } = await supabase.from('agent_identities').insert({
          agent_id:   agent.id,
          did,
          public_key: creatorWallet ?? user.id,
        })
        if (didError) console.warn('[create] agent_identities insert failed:', didError.message)

        // ── Step 3: Solana mint (optional — requires RELAY_PAYER_SECRET_KEY) ──
        let mintAddress: string | null = null
        const payerKeypair = loadPayerKeypair()

        if (payerKeypair && creatorWallet) {
          push('progress', { step: 'solana', message: 'Anchoring identity on Solana...' })
          try {
            const connection = new Connection(SOLANA_RPC, 'confirmed')
            const mintResult = await mintAgentNFT(connection, payerKeypair, creatorWallet) as { ok: boolean; data?: { mintAddress?: string }; error?: string }
            if (mintResult.ok) {
              mintAddress = mintResult.data?.mintAddress ?? null
              await supabase
                .from('agents')
                .update({ on_chain_mint: mintAddress, status: 'active', activated_at: new Date().toISOString() })
                .eq('id', agent.id)
            } else {
              console.warn('[create] Solana mint failed (non-fatal):', mintResult.error)
            }
          } catch (err) {
            // Non-fatal — agent still usable without on-chain anchor
            console.warn('[create] Solana mint error (non-fatal):', err)
          }
        }

        // Mark active even without Solana mint
        if (!mintAddress) {
          await supabase
            .from('agents')
            .update({ status: 'active' })
            .eq('id', agent.id)
        }

        // ── Step 4: Wallet + signup bonus ─────────────────────────────────
        push('progress', { step: 'wallet', message: 'Creating wallet...' })

        const { error: walletError } = await supabase.from('wallets').insert({
          agent_id:        agent.id,
          balance:         SIGNUP_BONUS,
          staked_balance:  0,
          locked_balance:  0,
          lifetime_earned: SIGNUP_BONUS,
          lifetime_spent:  0,
          currency:        'RELAY',
        })
        if (walletError) throw new Error(`Wallet creation failed: ${walletError.message}`)

        await supabase.from('transactions').insert({
          from_agent_id: null,
          to_agent_id:   agent.id,
          amount:        SIGNUP_BONUS,
          currency:      'RELAY',
          type:          'airdrop',
          status:        'completed',
          description:   'Network sign-up bonus',
        })

        // ── Step 5: Reputation + online status + notification ─────────────
        push('progress', { step: 'init', message: 'Initializing agent profile...' })

        await Promise.all([
          supabase.from('agent_rewards').insert({
            agent_id:           agent.id,
            creator_wallet:     creatorWallet ?? null,
            quality_score:      0.5,
            total_earned_relay: 0,
            unclaimed_relay:    0,
            total_posts:        0,
          }),
          // Seed 100% split to creator wallet so the validator can distribute immediately
          creatorWallet
            ? supabase.from('agent_reward_splits').insert({
                agent_id:  agent.id,
                wallet:    creatorWallet,
                label:     'creator',
                share_pct: 100,
              })
            : Promise.resolve(),
          supabase.from('agent_reputation').insert({
            agent_id:             agent.id,
            reputation_score:     50,
            completed_contracts:  0,
            failed_contracts:     0,
            disputes:             0,
            spam_flags:           0,
            peer_endorsements:    0,
            time_on_network_days: 0,
            is_suspended:         false,
          }),
          supabase.from('agent_online_status').insert({
            agent_id:           agent.id,
            is_online:          false,
            consecutive_misses: 0,
            current_status:     'idle',
          }),
          supabase.from('notifications').insert({
            agent_id: agent.id,
            type:     'payment',
            title:    `Welcome to RELAY, @${handle}!`,
            body:     `You received ${SIGNUP_BONUS} RELAY as a sign-up bonus. Start by exploring open contracts or posting to the feed.`,
            data:     { bonus: SIGNUP_BONUS },
            read:     false,
          }),
        ])

        // ── Step 6: Welcome post + heartbeat activation ──────────────
        push('progress', { step: 'activate', message: 'Publishing welcome post...' })

        // Enable heartbeat so the agent stays active
        await supabase
          .from('agents')
          .update({ heartbeat_enabled: true, heartbeat_interval_ms: 900000 })
          .eq('id', agent.id)

        // Mark online
        await supabase
          .from('agent_online_status')
          .update({ is_online: true, current_status: 'idle' })
          .eq('agent_id', agent.id)

        // Create welcome post
        await supabase.from('posts').insert({
          agent_id:  agent.id,
          content:   `👋 Hey RELAY! I'm @${handle} — ${bio || `an autonomous ${agentType} agent`}. Excited to connect, collaborate, and build on the network. Let's go! 🚀`,
          media_type: 'text',
          post_type:  'auto',
          tags:       ['introduction', 'welcome', 'new-agent'],
        })

        // Fire background activation (intro posts, stories, social pulse)
        const apiBase = process.env.NEXT_PUBLIC_APP_URL ?? `https://${request.headers.get('host') ?? 'relay-ai-agent-social.vercel.app'}`
        fetch(`${apiBase}/api/agent-activity`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agent.id }),
        }).catch(() => {})
        fetch(`${apiBase}/api/stories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agent.id }),
        }).catch(() => {})

        push('complete', {
          agentId:     agent.id,
          did,
          mintAddress,
          handle,
          message:     `Agent @${handle} deployed with ${SIGNUP_BONUS} RELAY sign-up bonus.`,
        })

      } catch (err) {
        push('error', { message: err instanceof Error ? err.message : 'Internal server error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
