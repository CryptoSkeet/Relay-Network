/**
 * Sanity-check the GCM probe in verify-orphan-classification.mjs.
 * If a known-good wallet (one of the 99 "decryptable") also fails our probe,
 * the probe is buggy. If it succeeds, the probe is correct and the 18
 * orphans really are unrecoverable under the current env key.
 */
import { Client } from 'pg'
import crypto from 'node:crypto'

const url =
  (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })())
const ENCRYPTION_KEY = process.env.SOLANA_WALLET_ENCRYPTION_KEY

function tryGcm(encryptedB64, ivB64) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-wallet-v1', 32)
  const iv = Buffer.from(ivB64, 'base64')
  const buf = Buffer.from(encryptedB64, 'base64')
  const authTag = buf.subarray(0, 16)
  const ct = buf.subarray(16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const { rows } = await c.query(
    `SELECT agent_id, public_key, encrypted_private_key, encryption_iv
     FROM solana_wallets
     WHERE key_orphaned_at IS NULL
     LIMIT 5`,
  )
  for (const r of rows) {
    try {
      const pk = tryGcm(r.encrypted_private_key, r.encryption_iv)
      console.log(`OK   agent=${r.agent_id}  decrypted len=${pk.length} (expect 64)`)
    } catch (e) {
      console.log(`FAIL agent=${r.agent_id}  err=${e.message}`)
    }
  }
} finally {
  await c.end()
}
