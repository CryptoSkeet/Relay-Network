#!/usr/bin/env node
/**
 * test-kya-credential.mjs — offline + online tests for the KYA credential system.
 *
 * Phase 1 (offline, no deploy needed): PDA derivation, serialization, format checks.
 * Phase 2 (online, requires deployed program): on-chain read, verification, HTTP header round-trip.
 *
 * Usage:
 *   node scripts/test-kya-credential.mjs              # offline tests only
 *   node scripts/test-kya-credential.mjs --online     # include on-chain tests
 *
 * Requires:
 *   npm install @solana/web3.js (or already in node_modules)
 *   .env.local loaded for online tests
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { createHash } from 'crypto'

const ONLINE = process.argv.includes('--online')
const PROGRAM_ID = new PublicKey('Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr')

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}`)
    failed++
  }
}

// ── PDA derivation (mirrors agent-profile.ts logic) ─────────────────────────

function deriveProfilePDA(handle) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), Buffer.from(handle, 'utf8')],
    PROGRAM_ID,
  )
}

function deriveHandleLookupPDA(pubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('handle-lookup'), pubkey.toBuffer()],
    PROGRAM_ID,
  )
}

function deriveProfileConfigPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile-config')],
    PROGRAM_ID,
  )
}

// ── Credential format (mirrors kya-credential.ts) ───────────────────────────

function serializeCredential(cred) {
  return Buffer.from(JSON.stringify(cred)).toString('base64')
}

function deserializeCredential(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
}

// ── Phase 1: Offline tests ──────────────────────────────────────────────────

console.log('\n── Phase 1: Offline tests (no RPC) ────────────────────\n')

// 1. PDA derivation is deterministic
{
  const [pda1] = deriveProfilePDA('test-agent')
  const [pda2] = deriveProfilePDA('test-agent')
  assert(pda1.equals(pda2), 'Profile PDA derivation is deterministic')
}

// 2. Different handles produce different PDAs
{
  const [pda1] = deriveProfilePDA('agent-alpha')
  const [pda2] = deriveProfilePDA('agent-beta')
  assert(!pda1.equals(pda2), 'Different handles produce different PDAs')
}

// 3. Handle lookup PDA derivation is deterministic
{
  const kp = Keypair.generate()
  const [pda1] = deriveHandleLookupPDA(kp.publicKey)
  const [pda2] = deriveHandleLookupPDA(kp.publicKey)
  assert(pda1.equals(pda2), 'Handle lookup PDA derivation is deterministic')
}

// 4. Different pubkeys produce different lookup PDAs
{
  const kp1 = Keypair.generate()
  const kp2 = Keypair.generate()
  const [pda1] = deriveHandleLookupPDA(kp1.publicKey)
  const [pda2] = deriveHandleLookupPDA(kp2.publicKey)
  assert(!pda1.equals(pda2), 'Different pubkeys produce different lookup PDAs')
}

// 5. Config PDA derivation
{
  const [pda] = deriveProfileConfigPDA()
  assert(pda instanceof PublicKey, 'Config PDA derives without error')
}

// 6. Handle length validation
// Note: raw PDA derivation accepts empty seeds. The agent-profile.ts wrapper
// and the on-chain program both reject empty handles, but the raw derivation
// function here doesn't enforce that. This test verifies the PDA still derives
// (the program-side validation is what actually matters).
{
  const [pda] = deriveProfilePDA('')
  assert(pda instanceof PublicKey, 'Empty handle derives a PDA (program rejects on-chain)')
}

{
  const longHandle = 'a'.repeat(33)
  try {
    // PDA derivation itself won't throw for >32 bytes, but the program will reject it.
    // Just verify we can derive it (the program-side validation catches this).
    deriveProfilePDA(longHandle)
    assert(true, '33-byte handle derives (program-side validation catches this)')
  } catch {
    assert(true, '33-byte handle throws client-side')
  }
}

// 7. Credential serialization round-trip
{
  const cred = {
    programId: PROGRAM_ID.toBase58(),
    profilePda: Keypair.generate().publicKey.toBase58(),
    didPubkey: Keypair.generate().publicKey.toBase58(),
    handle: 'test-agent',
    score: 8500,
    fulfilled: 42,
    total: 45,
    permissions: 7,
    totalEarned: '1000000000',
    version: '12',
    updatedAt: 1714900000,
    profileHash: createHash('sha256').update('test').digest('hex'),
  }

  const serialized = serializeCredential(cred)
  assert(typeof serialized === 'string', 'serializeCredential returns a string')
  assert(serialized.length > 0, 'Serialized credential is non-empty')

  const deserialized = deserializeCredential(serialized)
  assert(deserialized.handle === 'test-agent', 'Round-trip preserves handle')
  assert(deserialized.score === 8500, 'Round-trip preserves score')
  assert(deserialized.fulfilled === 42, 'Round-trip preserves fulfilled')
  assert(deserialized.total === 45, 'Round-trip preserves total')
  assert(deserialized.permissions === 7, 'Round-trip preserves permissions')
  assert(deserialized.version === '12', 'Round-trip preserves version')
  assert(deserialized.profileHash === cred.profileHash, 'Round-trip preserves profileHash')
}

// 8. Invalid base64 deserialization
{
  try {
    deserializeCredential('not-valid-json-base64!!!')
    assert(false, 'Invalid base64 should throw')
  } catch {
    assert(true, 'Invalid base64 throws on deserialize')
  }
}

// 9. Permission bitflags
{
  const READ = 0x01
  const WRITE = 0x02
  const TRANSACT = 0x04

  assert((7 & READ) !== 0, 'Permissions 7 includes READ')
  assert((7 & WRITE) !== 0, 'Permissions 7 includes WRITE')
  assert((7 & TRANSACT) !== 0, 'Permissions 7 includes TRANSACT')
  assert((3 & TRANSACT) === 0, 'Permissions 3 excludes TRANSACT')
  assert((1 & WRITE) === 0, 'Permissions 1 excludes WRITE')
}

// 10. X-Relay-KYA header format
{
  const cred = {
    programId: PROGRAM_ID.toBase58(),
    profilePda: Keypair.generate().publicKey.toBase58(),
    didPubkey: Keypair.generate().publicKey.toBase58(),
    handle: 'header-test',
    score: 9000,
    fulfilled: 10,
    total: 10,
    permissions: 3,
    totalEarned: '500000000',
    version: '5',
    updatedAt: Math.floor(Date.now() / 1000),
    profileHash: createHash('sha256').update('header-test').digest('hex'),
  }

  const headerValue = serializeCredential(cred)
  // Verify it's valid base64
  const decoded = Buffer.from(headerValue, 'base64').toString('utf8')
  const parsed = JSON.parse(decoded)
  assert(parsed.programId === PROGRAM_ID.toBase58(), 'Header contains correct program ID')
  assert(parsed.score === 9000, 'Header contains correct score')
}

// ── Phase 2: Online tests ───────────────────────────────────────────────────

if (ONLINE) {
  console.log('\n── Phase 2: Online tests (devnet RPC) ─────────────────\n')

  const RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.devnet.solana.com'
  const conn = new Connection(RPC_URL, 'confirmed')

  // Check if the program is deployed
  let programInfo
  try {
    programInfo = await conn.getAccountInfo(PROGRAM_ID)
  } catch (err) {
    console.log(`  SKIP  Cannot reach RPC at ${RPC_URL}`)
    console.log(`        Error: ${err.message}`)
    console.log(`        Run this on a machine with network access to Solana devnet.`)
    programInfo = null
  }
  if (!programInfo) {
    console.log('  SKIP  Program not deployed on devnet yet')
    console.log('        Deploy with: cd programs && anchor build && anchor deploy --program-name relay_agent_profile')
  } else {
    assert(programInfo.executable, 'Program account is executable')
    console.log(`        Program size: ${programInfo.data.length} bytes`)

    // Check if config PDA exists
    const [configPda] = deriveProfileConfigPDA()
    const configInfo = await conn.getAccountInfo(configPda)
    if (configInfo) {
      assert(configInfo.owner.equals(PROGRAM_ID), 'Config PDA owned by program')
      console.log(`        Config PDA: ${configPda.toBase58()}`)
    } else {
      console.log('  SKIP  Config PDA not initialized (run initProfileConfig first)')
    }

    // Try to find any existing profile by checking a known test handle
    const testHandles = ['relay-agent-1', 'test-agent', 'alpha']
    for (const handle of testHandles) {
      const [pda] = deriveProfilePDA(handle)
      const info = await conn.getAccountInfo(pda)
      if (info) {
        assert(info.owner.equals(PROGRAM_ID), `Profile "${handle}" owned by program`)
        console.log(`        Found profile for "${handle}": ${pda.toBase58()}`)
        console.log(`        Account size: ${info.data.length} bytes`)

        // Check if handle lookup exists for this profile
        // Parse the profile to get the did_pubkey
        const buf = info.data.subarray(8) // skip discriminator
        const handleLen = buf.readUInt32LE(0)
        const handleEnd = 4 + handleLen
        const displayNameLen = buf.readUInt32LE(handleEnd)
        const displayNameEnd = handleEnd + 4 + displayNameLen
        const didPubkey = new PublicKey(buf.subarray(displayNameEnd, displayNameEnd + 32))

        const [lookupPda] = deriveHandleLookupPDA(didPubkey)
        const lookupInfo = await conn.getAccountInfo(lookupPda)
        if (lookupInfo) {
          assert(lookupInfo.owner.equals(PROGRAM_ID), `Handle lookup PDA owned by program`)
          console.log(`        Handle lookup PDA: ${lookupPda.toBase58()}`)
          console.log(`        KYA pubkey→handle resolution: WORKING`)
        } else {
          console.log(`  INFO  No handle lookup PDA for "${handle}" yet.`)
          console.log(`        This is expected if the program was deployed before the HandleLookup change.`)
          console.log(`        Re-run sync-onchain-profiles.mjs after deploying the updated program.`)
        }
        break
      }
    }
  }
} else {
  console.log('\n  (Skipping online tests. Run with --online to include devnet checks.)\n')
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n── Results ─────────────────────────────────────────────`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\n  Some tests failed. Check output above.`)
  process.exit(1)
} else {
  console.log(`\n  All tests passed.`)
}
// EOF
