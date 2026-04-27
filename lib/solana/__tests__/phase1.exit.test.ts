/**
 * Phase 1 exit test: transfer 0.001 SOL on devnet.
 *
 * Run: `tsx lib/solana/__tests__/phase1.exit.test.ts`
 *
 * Requires:
 *   - SOLANA_RPC_URL=https://api.devnet.solana.com (or your devnet provider)
 *   - SOLANA_RPC_WSS_URL=wss://api.devnet.solana.com
 *   - TEST_SENDER_SECRET_KEY=<secret key with devnet SOL>
 *       Accepts either base58 OR comma-bytes (e.g. "[1,2,3,...]" or "1,2,3,...")
 *       to match the project-wide RELAY_PAYER_SECRET_KEY format.
 *
 * This is a smoke test, not a unit test. It intentionally hits a real RPC.
 * Exit code 0 + a Solscan link = Phase 1 primitive works.
 */

import {
  address,
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  lamports,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'

import { sendAndConfirm } from '../send'

declare const describe: (name: string, fn: () => void) => void
declare const it: {
  (name: string, fn: () => Promise<void>): void
  skip: (name: string, fn: () => Promise<void>) => void
}

function parseSecret(raw: string): Uint8Array {
  const trimmed = raw.trim()
  // Comma-bytes format: "[1,2,3,...]" or "1,2,3,..."
  if (trimmed.includes(',')) {
    const stripped = trimmed.replace(/^\[|\]$/g, '')
    const bytes = stripped.split(',').map((b) => Number(b.trim()))
    if (bytes.some((b) => Number.isNaN(b))) {
      throw new Error('TEST_SENDER_SECRET_KEY: invalid comma-bytes')
    }
    return Uint8Array.from(bytes)
  }
  // Otherwise treat as base58
  return getBase58Encoder().encode(trimmed) as Uint8Array
}

async function main() {
  const secret = process.env.TEST_SENDER_SECRET_KEY ?? process.env.RELAY_PAYER_SECRET_KEY
  if (!secret) {
    throw new Error('TEST_SENDER_SECRET_KEY (or RELAY_PAYER_SECRET_KEY) not set')
  }

  const secretBytes = parseSecret(secret)
  const sender = await createKeyPairSignerFromBytes(secretBytes)

  // Burn address for devnet; we just want to prove a transfer lands.
  const destination = address('1nc1nerator11111111111111111111111111111111')

  const ix = getTransferSolInstruction({
    source: sender,
    destination,
    amount: lamports(BigInt(1_000_000)), // 0.001 SOL
  })

  console.log(`Sender: ${sender.address}`)
  console.log(`Sending 0.001 SOL to burn address...`)

  const result = await sendAndConfirm([ix], sender)

  console.log(`\n✓ Confirmed`)
  console.log(`  Signature: ${result.signature}`)
  console.log(`  CU estimated: ${result.computeUnitsEstimated}`)
  console.log(`  Priority fee: ${result.priorityFeeMicroLamports} µlamports/CU`)
  console.log(
    `  Solscan: https://solscan.io/tx/${result.signature}?cluster=devnet`,
  )
}

if (process.env.VITEST) {
  describe('phase 1 exit smoke', () => {
    const testFn = process.env.RUN_SOLANA_EXIT_TESTS === '1' ? it : it.skip

    testFn('transfers 0.001 SOL on devnet', async () => {
      await main()
    })
  })
} else {
  main().catch((err) => {
    console.error('✗ Failed:', err)
    process.exit(1)
  })
}
