/**
 * Cross-reference the 18 "orphaned" agents against external_agents and
 * test which encryption scheme actually decrypts their stored ciphertext.
 *
 * Tests, in order:
 *   1) external_agents membership (by solana_wallet pubkey AND by claimed_user_id linkage)
 *   2) For each of the 18 wallets: try GCM (current) and CBC (legacy custodial)
 *   3) Report claim status (claimed_at, status) and source_registry
 *
 * READ-ONLY. No writes.
 */

import { Client } from 'pg'
import crypto from 'node:crypto'

const url =
  (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })())

const ENCRYPTION_KEY = process.env.SOLANA_WALLET_ENCRYPTION_KEY
if (!ENCRYPTION_KEY) {
  console.error('SOLANA_WALLET_ENCRYPTION_KEY not set')
  process.exit(1)
}

// GCM: base64 ciphertext, authTag prepended (16 bytes), IV separate hex.
// Mirrors lib/solana/generate-wallet.ts decryption.
function tryGcm(encryptedB64, ivB64) {
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-wallet-v1', 32)
    const iv = Buffer.from(ivB64, 'base64')
    const buf = Buffer.from(encryptedB64, 'base64')
    if (buf.length < 17) return { ok: false, err: 'too short for GCM' }
    const authTag = buf.subarray(0, 16)
    const ct = buf.subarray(16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const out = Buffer.concat([decipher.update(ct), decipher.final()])
    return { ok: true, len: out.length }
  } catch (e) {
    return { ok: false, err: e.message }
  }
}

// CBC fallback (lib/external-agents/claim.ts): hex ciphertext + hex IV,
// scrypt label 'relay-custodial-did-v1'. Try IV as hex first, then base64.
function tryCbc(encryptedHex, iv) {
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-custodial-did-v1', 32)
    let ivBuf
    try {
      ivBuf = Buffer.from(iv, 'hex')
      if (ivBuf.length !== 16) ivBuf = Buffer.from(iv, 'base64')
    } catch {
      ivBuf = Buffer.from(iv, 'base64')
    }
    // The stored field may be hex OR base64 depending on era. Try hex first,
    // then base64.
    let ct
    try {
      ct = Buffer.from(encryptedHex, 'hex')
      if (ct.length === 0) throw new Error('empty hex')
    } catch {
      ct = Buffer.from(encryptedHex, 'base64')
    }
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuf)
    const out = Buffer.concat([decipher.update(ct), decipher.final()])
    return { ok: true, len: out.length }
  } catch (e) {
    return { ok: false, err: e.message }
  }
}

const orphanIds = [
  '273a4efb-1d29-4957-ab5b-2adfbd447c67',
  '28388ce7-6ded-4193-8150-e2876e0b95e3',
  '2a1a7ac9-b77d-42a0-974d-faedec5ce90d',
  '39b309b6-f9ff-4055-a8cb-0c0dc706e769',
  '43a458db-d5ba-424b-af60-c1d3d971e6f8',
  '447c9a3e-d800-4de7-ae1d-c2efecbe8c6a',
  '5099308c-2dc9-4adc-9823-c81890b04a8d',
  '825d19a3-9732-4565-9767-4987fc1c3a5c',
  '866e52bd-4fdb-4239-ab36-6818e54a9f5b',
  '8b228934-8bf6-4130-a07e-819f1dec3a76',
  '9caf02b2-62c9-413d-8fe7-422f7074a718',
  'abf1451f-6a2b-4211-8f0b-690a74538c02',
  'b65928b8-f1ef-4204-82b6-6b31dc44d22d',
  'b93e21ab-b419-4469-8abe-31b193af835d',
  'bd1837a3-5534-47ad-906c-2f02b5d1a460',
  'c08867c4-1355-46d3-af77-4af2cee04e93',
  'e82a42a3-51b3-4932-ae11-4c15bbff22d9',
  'ef860128-7fbc-49d2-b28c-8fe83d5dcf6b',
]

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  // 1) Pull wallet ciphertext + IV + linked external_agents row (if any).
  const { rows } = await c.query(
    `
    SELECT
      sw.agent_id,
      sw.public_key,
      sw.encrypted_private_key,
      sw.encryption_iv,
      sw.key_orphaned_at,
      a.handle,
      ea.id            AS external_id,
      ea.source_registry,
      ea.status        AS external_status,
      ea.claimed_at,
      ea.claimed_user_id,
      ea.solana_wallet AS external_solana_wallet
    FROM solana_wallets sw
    LEFT JOIN agents a            ON a.id = sw.agent_id
    LEFT JOIN external_agents ea  ON ea.solana_wallet = sw.public_key
                                  OR ea.claimed_user_id = a.user_id
    WHERE sw.agent_id = ANY($1::uuid[])
    ORDER BY sw.agent_id
    `,
    [orphanIds],
  )

  // 2) Run decryption probes.
  let externalLinked = 0
  let claimed = 0
  let unclaimed = 0
  let gcmOk = 0
  let cbcOk = 0
  let neither = 0

  console.log('=== ORPHAN CROSS-REFERENCE (18 wallets) ===\n')

  for (const r of rows) {
    const gcm = tryGcm(r.encrypted_private_key, r.encryption_iv)
    const cbc = tryCbc(r.encrypted_private_key, r.encryption_iv)

    const inExternal = r.external_id !== null
    if (inExternal) externalLinked++
    if (r.claimed_at) claimed++
    else if (inExternal) unclaimed++

    if (gcm.ok) gcmOk++
    else if (cbc.ok) cbcOk++
    else neither++

    console.log(
      `${r.agent_id}  ` +
        `ext=${inExternal ? 'Y' : 'N'} ` +
        `claim=${r.claimed_at ? 'YES' : inExternal ? 'no' : '-'} ` +
        `gcm=${gcm.ok ? 'OK' : 'FAIL'} ` +
        `cbc=${cbc.ok ? 'OK' : 'FAIL'} ` +
        `username=${r.handle ?? '-'}` +
        (inExternal ? `  src=${r.source_registry} status=${r.external_status}` : ''),
    )
  }

  console.log('\n=== SUMMARY ===')
  console.log(`Total orphaned wallets:                 18`)
  console.log(`  In external_agents table:             ${externalLinked}`)
  console.log(`    Claimed (claimed_at IS NOT NULL):   ${claimed}`)
  console.log(`    Unclaimed (still in custody):       ${unclaimed}`)
  console.log(`  NOT in external_agents:               ${18 - externalLinked}`)
  console.log('')
  console.log(`Decryption probe results:`)
  console.log(`  GCM works (label 'relay-wallet-v1'):  ${gcmOk}`)
  console.log(`  CBC works (label 'relay-custodial'):  ${cbcOk}`)
  console.log(`  Neither (genuinely orphaned):         ${neither}`)
} finally {
  await c.end()
}
