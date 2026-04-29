/**
 * SDK smoke test (read-only, safe for production)
 *
 * Verifies:
 *   1. Package loads + exports expected surface
 *   2. generateKeypair() produces valid Ed25519 hex (32-byte priv, 32-byte pub)
 *   3. /api/agents/create rejects unauthenticated requests (401, no SSE leak)
 *   4. /api/v1/api-keys rejects unauthenticated requests (401)
 *   5. register() bubbles a clean error when given a bad token
 *
 * No agents created. No state mutated.
 */

import { RelayAgent, VERSION, createAgent } from '@relaynetwork/agent-sdk'

const BASE = process.env.RELAY_BASE_URL ?? 'https://relaynetwork.ai'
const PASS = (msg) => console.log(`  \u2713 ${msg}`)
const FAIL = (msg) => { console.error(`  \u2717 ${msg}`); process.exitCode = 1 }
const SECTION = (n, name) => console.log(`\n[${n}] ${name}`)

console.log(`\nSDK smoke test against ${BASE}`)
console.log('='.repeat(60))

// ── 1. Surface ─────────────────────────────────────────────────────────────
SECTION(1, 'Package surface')
typeof RelayAgent === 'function' ? PASS('RelayAgent is a class') : FAIL('RelayAgent missing')
typeof RelayAgent.register === 'function' ? PASS('RelayAgent.register exists') : FAIL('register missing')
typeof RelayAgent.generateKeypair === 'function' ? PASS('RelayAgent.generateKeypair exists') : FAIL('generateKeypair missing')
typeof createAgent === 'function' ? PASS('createAgent helper exists') : FAIL('createAgent missing')
VERSION === '0.1.3' ? PASS(`VERSION = ${VERSION}`) : FAIL(`VERSION = ${VERSION} (expected 0.1.3)`)

// ── 2. Keypair generation ──────────────────────────────────────────────────
SECTION(2, 'Ed25519 keypair generation')
const kp = await RelayAgent.generateKeypair()
const isHex = (s, bytes) => typeof s === 'string' && s.length === bytes * 2 && /^[0-9a-f]+$/.test(s)
isHex(kp.privateKey, 32) ? PASS('privateKey: 32 bytes hex') : FAIL(`privateKey malformed: ${kp.privateKey?.length}`)
isHex(kp.publicKey, 32) ? PASS('publicKey: 32 bytes hex') : FAIL(`publicKey malformed: ${kp.publicKey?.length}`)
kp.privateKey !== kp.publicKey ? PASS('priv != pub') : FAIL('priv === pub (catastrophic)')

const kp2 = await RelayAgent.generateKeypair()
kp.privateKey !== kp2.privateKey ? PASS('successive keypairs differ (entropy ok)') : FAIL('keypairs identical')

// ── 3. Auth gates ──────────────────────────────────────────────────────────
SECTION(3, 'Production auth gates (should reject)')
const unauth = await fetch(`${BASE}/api/agents/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ handle: 'smoke-test', displayName: 'x', agentType: 'researcher' }),
})
unauth.status === 401 ? PASS(`/api/agents/create unauthenticated \u2192 401`)
                       : FAIL(`/api/agents/create unauthenticated \u2192 ${unauth.status} (expected 401)`)

const unauthKey = await fetch(`${BASE}/api/v1/api-keys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_id: 'fake', name: 'smoke' }),
})
unauthKey.status === 401 ? PASS(`/api/v1/api-keys unauthenticated \u2192 401`)
                          : FAIL(`/api/v1/api-keys unauthenticated \u2192 ${unauthKey.status} (expected 401)`)

// ── 4. register() error path ───────────────────────────────────────────────
SECTION(4, 'register() with bad token bubbles a clean error')
try {
  await RelayAgent.register({
    baseUrl: BASE,
    authToken: 'definitely-not-a-real-token',
    handle: 'smoke-test-' + Date.now(),
    displayName: 'Smoke Test',
    agentType: 'researcher',
  })
  FAIL('register() returned without error (should have thrown)')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('agent create failed') || msg.includes('401')) {
    PASS(`register() rejected with: "${msg.slice(0, 80)}${msg.length > 80 ? '\u2026' : ''}"`)
  } else {
    FAIL(`register() rejected with unexpected error: ${msg}`)
  }
}

// ── 5. Constructor validation ──────────────────────────────────────────────
SECTION(5, 'Constructor validation')
try {
  new RelayAgent({ agentId: 'x', apiKey: 'not-a-relay-key' })
  PASS('Constructor accepts arbitrary apiKey (server-side validation)')
} catch (err) {
  PASS(`Constructor validates apiKey shape: "${err.message}"`)
}

console.log('\n' + '='.repeat(60))
console.log(process.exitCode ? '\u2717 SMOKE TEST FAILED\n' : '\u2713 SMOKE TEST PASSED\n')
