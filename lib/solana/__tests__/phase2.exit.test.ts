/**
 * Phase 2 exit test: agent signs and sends a memo transaction.
 *
 * Run: `pnpm exec tsx lib/solana/__tests__/phase2.exit.test.ts <agentId>`
 *
 * Requires:
 *   - All Phase 1 envs (SOLANA_RPC_URL, SOLANA_RPC_WSS_URL)
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SOLANA_WALLET_ENCRYPTION_KEY
 *   - One existing agent in `solana_wallets` with funded devnet SOL
 *
 * Pass = Solscan link prints, agent's address is the fee payer, memo lands.
 *
 * If you don't have a funded agent on devnet, fund one first:
 *   solana airdrop 1 <agent_public_key> --url devnet
 */

import { getAddMemoInstruction } from '@solana-program/memo'

import { getAgentAddress, getAgentSigner } from '../agent-signer'
import { sendAndConfirm } from '../send'

declare const describe: (name: string, fn: () => void) => void
declare const it: {
  (name: string, fn: () => Promise<void>): void
  skip: (name: string, fn: () => Promise<void>) => void
}

async function main() {
  const agentId = process.argv[2]
  if (!agentId) {
    console.error('Usage: tsx phase2.exit.test.ts <agentId>')
    process.exit(1)
  }

  const address = await getAgentAddress(agentId)
  console.log(`Agent ${agentId} address: ${address}`)

  console.log('Loading signer (fetch + decrypt)...')
  const signer = await getAgentSigner(agentId)

  if (signer.address !== address) {
    throw new Error(
      `Public key mismatch! DB says ${address}, derived signer says ${signer.address}. ` +
        `This means the encrypted_private_key does not match the stored public_key.`,
    )
  }
  console.log('✓ Public key matches DB row')

  console.log('Sending memo transaction...')
  const memoIx = getAddMemoInstruction({
    memo: `relay phase 2 exit test :: ${new Date().toISOString()}`,
  })

  const result = await sendAndConfirm([memoIx], signer)

  console.log(`\n✓ Confirmed`)
  console.log(`  Signature: ${result.signature}`)
  console.log(`  CU estimated: ${result.computeUnitsEstimated}`)
  console.log(`  Priority fee: ${result.priorityFeeMicroLamports} µlamports/CU`)
  console.log(
    `  Solscan: https://solscan.io/tx/${result.signature}?cluster=devnet`,
  )
}

if (process.env.VITEST) {
  describe('phase 2 exit smoke', () => {
    const testFn = process.env.RUN_SOLANA_EXIT_TESTS === '1' ? it : it.skip

    testFn('sends an agent-signed memo transaction', async () => {
      await main()
    })
  })
} else {
  main().catch((err) => {
    console.error('✗ Failed:', err)
    if (err && typeof err === 'object' && 'kind' in err) {
      console.error(`  kind: ${(err as { kind: string }).kind}`)
    }
    process.exit(1)
  })
}
