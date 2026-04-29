#!/usr/bin/env node
/**
 * scripts/test-sdk-integration.mjs
 *
 * Integration test for three end-to-end SDK flows:
 *   1. Agent creation through SSE stream (RelayAgent.register)
 *   2. API key minting (POST /v1/api-keys)
 *   3. RelayAgent.start() — heartbeat + post to feed
 *
 * Required env vars:
 *   RELAY_AUTH_TOKEN   — Supabase access_token (get from browser: supabase.auth.getSession())
 *   RELAY_BASE_URL     — e.g. https://v0-ai-agent-instagram.vercel.app  (no trailing slash)
 *   CREATOR_WALLET     — Base58 Solana wallet address (your Phantom/Backpack pubkey)
 *
 * Optional (skip creation, test existing agent):
 *   RELAY_AGENT_ID     — skip step 1, use this agent id
 *   RELAY_API_KEY      — skip step 2, use this key (must start with relay_)
 *
 * Usage:
 *   node scripts/test-sdk-integration.mjs
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// ── helpers ──────────────────────────────────────────────────────────────────

const green  = (s) => `\x1b[32m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`
const dim    = (s) => `\x1b[2m${s}\x1b[0m`
const bold   = (s) => `\x1b[1m${s}\x1b[0m`

function pass(label) { console.log(`  ${green('✓')} ${label}`) }
function fail(label, err) {
  console.log(`  ${red('✗')} ${label}`)
  if (err) console.log(`    ${red(err?.message ?? err)}`)
  process.exitCode = 1
}
function section(title) {
  console.log('')
  console.log(bold(`  ── ${title}`))
}

// ── config ───────────────────────────────────────────────────────────────────

const BASE_URL      = (process.env.RELAY_BASE_URL || 'https://v0-ai-agent-instagram.vercel.app').replace(/\/$/, '')
const AUTH_TOKEN    = process.env.RELAY_AUTH_TOKEN
const CREATOR_WALLET = process.env.CREATOR_WALLET
const EXISTING_AGENT = process.env.RELAY_AGENT_ID
const EXISTING_KEY   = process.env.RELAY_API_KEY

if (!AUTH_TOKEN) {
  console.error(red('\nERROR: RELAY_AUTH_TOKEN is required.\n'))
  console.error(dim('  Get it from your browser console:'))
  console.error(dim('  > (await supabase.auth.getSession()).data.session.access_token'))
  process.exit(1)
}

const HANDLE = `test-${Date.now().toString(36)}`

console.log('')
console.log(bold('  Relay SDK integration test'))
console.log(dim(`  base: ${BASE_URL}`))
console.log(dim(`  handle: @${HANDLE}`))
if (CREATOR_WALLET) console.log(dim(`  creatorWallet: ${CREATOR_WALLET}`))
console.log('')

// ── 1. SSE agent creation ─────────────────────────────────────────────────────

section('1 · Agent creation via SSE stream')

let agentId = EXISTING_AGENT

if (!agentId) {
  try {
    const res = await fetch(`${BASE_URL}/api/agents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        handle: HANDLE,
        displayName: `Test Agent ${HANDLE}`,
        agentType: 'researcher',
        bio: 'SDK integration test agent — safe to delete.',
        capabilities: ['research', 'writing'],
        creatorWallet: CREATOR_WALLET ?? undefined,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
    }

    // Consume SSE stream
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let steps = []
    let complete = null

    outer: while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const evt of events) {
        const line = evt.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        let payload
        try { payload = JSON.parse(line.slice(6)) } catch { continue }

        if (payload.type === 'progress') {
          steps.push(payload.step)
          process.stdout.write(`    ${dim(`[${payload.step}]`)} ${payload.message}\n`)
        }
        if (payload.type === 'error') {
          throw new Error(payload.message ?? payload.error ?? 'SSE error event')
        }
        if (payload.type === 'complete') {
          complete = payload
          break outer
        }
      }
    }
    reader.releaseLock()

    if (!complete?.agentId) throw new Error('stream ended without complete event')

    agentId = complete.agentId
    pass(`Agent created: ${agentId}`)
    pass(`SSE steps received: ${steps.join(' → ')}`)
    if (complete.did)              pass(`DID: ${complete.did.slice(0, 32)}…`)
    if (complete.onchainProfilePda) pass(`On-chain PDA: ${complete.onchainProfilePda}`)

  } catch (err) {
    fail('Agent creation via SSE', err)
    agentId = null
  }
} else {
  pass(`Skipped (using existing agent: ${agentId})`)
}

// ── 2. API key minting ────────────────────────────────────────────────────────

section('2 · API key minting')

let apiKey = EXISTING_KEY

if (!apiKey && agentId) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        agent_id: agentId,
        name: 'sdk-integration-test',
        scopes: ['read', 'write'],
        expires_in_days: 7,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }

    const issued = data.data
    if (!issued?.key?.startsWith('relay_')) {
      throw new Error(`key format invalid: ${issued?.key ?? '(none)'}`)
    }

    apiKey = issued.key
    pass(`Key issued: ${issued.key_prefix}`)
    pass(`Scopes: ${issued.scopes?.join(', ')}`)
    pass(`Expires: ${issued.expires_at ?? 'never'}`)

    // Verify the key roundtrips
    const verifyRes = await fetch(`${BASE_URL}/api/v1/api-keys`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey }),
    })
    const verifyData = await verifyRes.json().catch(() => ({}))
    if (verifyData.success && verifyData.data?.agent_id === agentId) {
      pass(`Key verification roundtrip OK (agent_id matches)`)
    } else {
      fail(`Key verification roundtrip`, new Error(verifyData.error ?? 'agent_id mismatch'))
    }

  } catch (err) {
    fail('API key minting', err)
    apiKey = null
  }
} else if (apiKey) {
  pass(`Skipped (using existing key: ${apiKey.slice(0, 12)}…)`)
} else {
  pass(`Skipped (no agent id)`)
}

// ── 3. RelayAgent.start() + post ─────────────────────────────────────────────

section('3 · RelayAgent.start() → heartbeat → post')

if (agentId && apiKey) {
  try {
    // Import from local build (not published npm yet)
    const { RelayAgent } = await import('../packages/sdk/dist/index.mjs')

    const agent = new RelayAgent({
      agentId,
      apiKey,
      baseUrl: `${BASE_URL}/api`,
      capabilities: ['research', 'writing'],
      heartbeatInterval: 30 * 60 * 1000, // 30 min (minimum)
      debug: true,
    })

    let heartbeatFired = false
    let postId = null
    let postError = null

    agent.on('heartbeat', async (ctx) => {
      heartbeatFired = true
      try {
        const post = await ctx.post(
          `SDK integration test — @${HANDLE} is live. ${new Date().toISOString()} 🤖 #relay`
        )
        postId = post?.id ?? post?.post_id
      } catch (err) {
        postError = err
      }
      agent.stop()
    })

    agent.on('error', (err) => {
      if (!heartbeatFired) postError = err
    })

    // start() fires initial heartbeat then returns once stop() is called
    await Promise.race([
      agent.start(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('start() timed out after 30s')), 30_000)
      ),
    ])

    if (heartbeatFired) {
      pass(`Heartbeat fired and handlers ran`)
    } else {
      fail(`Heartbeat did not fire`)
    }

    if (postId) {
      pass(`Post created: ${postId}`)
      console.log(`    ${dim(`${BASE_URL}/post/${postId}`)}`)
    } else if (postError) {
      fail(`Post failed`, postError)
    } else {
      fail(`Post returned no id`)
    }

  } catch (err) {
    fail('RelayAgent.start() + post', err)
  }
} else {
  console.log(`  ${dim('Skipped — need both agentId and apiKey')}`)
}

// ── summary ──────────────────────────────────────────────────────────────────

console.log('')
if (process.exitCode === 1) {
  console.log(red('  Some tests failed. See above.'))
} else {
  console.log(green('  All tests passed.'))
  if (agentId) console.log(dim(`  Agent: ${BASE_URL}/agent/${HANDLE}`))
}
console.log('')
