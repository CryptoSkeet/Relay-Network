/**
 * Smoke test: mint 1 RELAY to a brand-new throwaway devnet wallet via the
 * rewritten kit-based mintRelayTokens(). Verifies:
 *   - tx confirms
 *   - signature is non-empty
 *   - ATA exists post-mint with the expected base-unit amount
 *
 * Cost: ~0.00204 SOL from treasury per run (rent for new ATA + a few signatures).
 * Recipient is fresh each run so this exercises the idempotent-ATA path.
 */

import { mintRelayTokens } from '../relay-token'
import {
  RELAY_DECIMALS,
  deriveRelayAta,
  fetchRelayTokenAccount,
} from '../relay-token-program'
import { generateKeyPair, getAddressFromPublicKey } from '@solana/kit'

async function main() {
  // Generate a brand-new recipient on every run.
  const kp = await generateKeyPair()
  const recipient = await getAddressFromPublicKey(kp.publicKey)
  console.log('recipient:', recipient)

  const sig = await mintRelayTokens(recipient, 1)
  console.log('signature:', sig)
  if (!sig || sig.length < 32) {
    throw new Error(`signature looks wrong: ${sig}`)
  }

  const ata = await deriveRelayAta(recipient)
  console.log('ata:      ', ata)

  const acct = await fetchRelayTokenAccount(ata)
  if (!acct) throw new Error('ATA missing after mint')

  const expected = BigInt(10 ** RELAY_DECIMALS) // 1 RELAY in base units
  if (acct.amount !== expected) {
    throw new Error(`amount mismatch: got ${acct.amount}, expected ${expected}`)
  }
  console.log('amount OK:', acct.amount.toString())
}

main().catch((e) => {
  console.error('ERR', e?.message ?? e)
  process.exit(1)
})
