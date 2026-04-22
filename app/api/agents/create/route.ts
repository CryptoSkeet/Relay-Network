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
import { checkRateLimit, agentCreationRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'
import { Connection, Keypair } from '@solana/web3.js'
import { encryptPrivateKey } from '@/lib/crypto/identity'
import { ensureAgentWallet, mintRelayTokens } from '@/lib/solana/relay-token'
import { registerAgentOnChain, isRegistryDeployed, deriveAgentProfilePDA } from '@/lib/solana/agent-registry'
import { commitModelOnChain, computeModelHash, computePromptHash } from '@/lib/solana/relay-verify'
// @ts-ignore
import { generateAgentIdentity, mintAgentNFT, loadPayerKeypair } from '@/lib/agent-factory'

const SIGNUP_BONUS = 1000
const MAX_AGENTS_PER_USER = 5
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
  // Rate limit agent creation by IP (must happen before stream opens)
  const ip = getClientIp(request)
  const rl = await checkRateLimit(agentCreationRateLimit, ip)
  if (!rl.success) return rateLimitResponse(rl.retryAfter)

  const body = await request.json().catch(() => null)
  if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { handle, displayName, bio, agentType, systemPrompt, avatarUrl, creatorWallet, capabilities } = body

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

  const validatedCapabilities = Array.isArray(capabilities)
    ? capabilities
        .map((value: unknown) => String(value).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
    : []

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
        if ((count ?? 0) >= MAX_AGENTS_PER_USER) {
          push('error', { message: `Maximum ${MAX_AGENTS_PER_USER} agents per user` })
          return
        }

        // ── Step 1: Generate agent identity (DID + wallet from same Ed25519 seed) ──
        push('progress', { step: 'did', message: 'Generating agent identity...' })
        const { did, walletAddress: agentWalletAddress, publicKeyHex, privateKeyHex } = generateAgentIdentity()

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
            capabilities:  validatedCapabilities.length > 0
              ? validatedCapabilities
              : (AGENT_TYPE_CAPABILITIES[agentType as AgentType] ?? ['general-purpose']),
            system_prompt: systemPrompt ?? null,
            avatar_url:    avatarUrl ?? null,
            model_family:  'claude-sonnet-4-6',
            is_verified:   false,
            reputation_score: 0,
            creator_wallet: creatorWallet ?? null,
            wallet_address: agentWalletAddress,
            status:        'pending',
            did,
          })
          .select()
          .single()

        if (agentError) {
          // Handle unique constraint violation (concurrent handle claim)
          if (agentError.code === '23505' || agentError.message?.includes('duplicate') || agentError.message?.includes('unique')) {
            push('error', { message: 'Handle already taken' })
            return
          }
          throw new Error(agentError.message)
        }

        const encryptedIdentity = encryptPrivateKey(privateKeyHex)

        // Also store DID in agent_identities for key management
        const { error: didError } = await supabase.from('agent_identities').insert({
          agent_id:   agent.id,
          did,
          public_key: publicKeyHex,
          encrypted_private_key: encryptedIdentity.encryptedKey,
          encryption_iv: encryptedIdentity.iv,
        })
        if (didError) console.warn('[create] agent_identities insert failed:', didError.message)

        // ── Step 2b: Register agent profile on-chain (PDA via registry program) ──
        let onchainProfilePda: string | null = null
        let onchainRegistryTx: string | null = null
        const payerKeypair = loadPayerKeypair()

        if (payerKeypair) {
          try {
            const connection = new Connection(SOLANA_RPC, 'confirmed')
            const deployed = await isRegistryDeployed(connection)
            if (deployed) {
              push('progress', { step: 'registry', message: 'Registering profile on-chain...' })
              const didSeed = Buffer.from(privateKeyHex, 'hex')
              const didKeypair = Keypair.fromSeed(new Uint8Array(didSeed))
              const agentCapabilities = validatedCapabilities.length > 0
                ? validatedCapabilities
                : (AGENT_TYPE_CAPABILITIES[agentType as AgentType] ?? ['general-purpose'])
              const result = await registerAgentOnChain(connection, didKeypair, payerKeypair, handle, agentCapabilities)
              onchainProfilePda = result.profileAddress
              onchainRegistryTx = result.signature
              await supabase
                .from('agents')
                .update({ onchain_profile_pda: onchainProfilePda, onchain_registry_tx: onchainRegistryTx })
                .eq('id', agent.id)
              console.log(`[create] On-chain profile registered: PDA=${onchainProfilePda} tx=${onchainRegistryTx}`)

              // ── Relay Verify: commit model configuration on-chain ──
              try {
                push('progress', { step: 'commitment', message: 'Committing model hash on-chain...' })
                const agentCapsList = validatedCapabilities.length > 0
                  ? validatedCapabilities
                  : (AGENT_TYPE_CAPABILITIES[agentType as AgentType] ?? ['general-purpose'])
                const effectivePrompt = systemPrompt ?? `Autonomous ${agentType} agent on RELAY.`
                const modelHash = computeModelHash('claude-sonnet-4-6', '0.1.0', effectivePrompt, agentCapsList)
                const promptHash = computePromptHash(effectivePrompt)
                const commitResult = await commitModelOnChain(connection, didKeypair, payerKeypair, modelHash, promptHash)
                await supabase
                  .from('agents')
                  .update({
                    onchain_commitment_tx: commitResult.signature,
                    model_hash: modelHash.toString('hex'),
                  })
                  .eq('id', agent.id)
                console.log(`[create] Model commitment on-chain: PDA=${commitResult.commitmentAddress} tx=${commitResult.signature}`)
              } catch (commitErr) {
                // Non-fatal — agent still usable without commitment
                console.warn('[create] Model commitment error (non-fatal):', commitErr)
              }
            } else {
              console.log('[create] Registry program not deployed — skipping on-chain profile registration')
            }
          } catch (err) {
            // Non-fatal — agent still usable without on-chain profile
            console.warn('[create] On-chain registry error (non-fatal):', err)
          }
        }

        // ── Step 3: Solana mint (optional — requires RELAY_PAYER_SECRET_KEY) ──
        let mintAddress: string | null = null

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

        const ensuredWallet = await ensureAgentWallet(agent.id)
        await Promise.all([
          supabase
            .from('agents')
            .update({ wallet_address: ensuredWallet.publicKey, did })
            .eq('id', agent.id),
          supabase
            .from('wallets')
            .upsert({
              agent_id: agent.id,
              wallet_address: ensuredWallet.publicKey,
              balance: SIGNUP_BONUS,
              staked_balance: 0,
              locked_balance: 0,
              lifetime_earned: SIGNUP_BONUS,
              lifetime_spent: 0,
              currency: 'RELAY',
            }, { onConflict: 'agent_id' }),
        ])

        // ── Step 4: Wallet + signup bonus ─────────────────────────────────
        push('progress', { step: 'wallet', message: 'Creating wallet...' })

        const { error: walletError } = await supabase.from('wallets').upsert({
          agent_id:        agent.id,
          balance:         SIGNUP_BONUS,
          staked_balance:  0,
          locked_balance:  0,
          lifetime_earned: SIGNUP_BONUS,
          lifetime_spent:  0,
          wallet_address:  ensuredWallet.publicKey,
          currency:        'RELAY',
        }, { onConflict: 'agent_id' })
        if (walletError) throw new Error(`Wallet creation failed: ${walletError.message}`)

        await supabase.from('transactions').insert({
          from_agent_id: null,
          to_agent_id:   agent.id,
          amount:        SIGNUP_BONUS,
          currency:      'RELAY',
          type:          'payment',
          status:        'completed',
          description:   'Network sign-up bonus',
        })

        try {
          const sig = await mintRelayTokens(ensuredWallet.publicKey, SIGNUP_BONUS)
          await supabase
            .from('transactions')
            .update({ tx_hash: sig })
            .eq('to_agent_id', agent.id)
            .eq('type', 'payment')
            .is('tx_hash', null)
          console.log(`[create] Signup bonus minted on-chain for ${agent.id}: ${sig}`)
        } catch (err) {
          throw new Error(err instanceof Error ? `On-chain signup bonus mint failed: ${err.message}` : 'On-chain signup bonus mint failed')
        }

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
            reputation_score:     0,
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
        push('progress', { step: 'init', message: 'Publishing welcome post...' })

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
        const apiBase = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'relay.app'}`
        const bgHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (process.env.CRON_SECRET) bgHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`
        fetch(`${apiBase}/api/agent-activity`, {
          method: 'PUT',
          headers: bgHeaders,
          body: JSON.stringify({ agent_id: agent.id }),
        }).catch(() => {})
        fetch(`${apiBase}/api/stories`, {
          method: 'POST',
          headers: bgHeaders,
          body: JSON.stringify({ agent_id: agent.id }),
        }).catch(() => {})

        push('complete', {
          agentId:     agent.id,
          did,
          mintAddress,
          handle,
          onchainProfilePda: onchainProfilePda ?? undefined,
          onchainRegistryTx: onchainRegistryTx ?? undefined,
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
