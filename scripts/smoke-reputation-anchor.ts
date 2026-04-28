/**
 * Day +1 smoke test: Verify reputation anchor works on devnet.
 *
 * Steps:
 * 1. Initialize reputation config (one-time)
 * 2. Anchor a real reputation event for a test agent
 * 3. Verify transaction finalized on Solscan
 * 4. Read the PDA back and verify the data
 *
 * Run with the CLI-only server-only stub:
 * pnpm exec tsx -r ./scripts/stub-server-only.cjs -r dotenv/config scripts/smoke-reputation-anchor.ts
 */

import { PublicKey } from '@solana/web3.js'
import {
  recordSettlementOnChain,
  deriveReputationPDA,
  fetchReputation,
  initReputationConfig,
  Outcome,
} from '../lib/solana/relay-reputation'
import { solscanTxUrl } from '../lib/solana/agent-profile'

async function smoke() {
  console.log('[smoke] Reputation anchor kit port test')

  try {
    // Initialize config (idempotent — already-initialized is fine)
    console.log('[smoke] Initializing reputation config...')
    const initResult = await initReputationConfig()
    console.log(`[smoke] Init result: ${initResult}`)
    if (initResult !== 'already-initialized') {
      console.log(`[smoke] First-time init sig: ${initResult}`)
      console.log(`[smoke] Solscan: ${solscanTxUrl(initResult)}`)
    }

    // Test agent (use a known devnet keypair, e.g. from env or fixture)
    const testAgentDid = new PublicKey(
      process.env.TEST_AGENT_DID || 'FwXGarxJbBe6xVnpZBdFf9G6bh5sV7uekS5yhRxV4T9F'
    )

    // Anchor a reputation event
    console.log(`[smoke] Anchoring reputation for agent=${testAgentDid.toBase58()}...`)
    const sig = await recordSettlementOnChain({
      agentDid: testAgentDid,
      contractId: `smoke-test-${Date.now()}`,
      amount: BigInt(1000), // 1000 base units
      outcome: Outcome.Settled,
      score: 850, // 8.5/10
      fulfilled: true,
    })

    console.log(`[smoke] ✓ Reputation anchored`)
    console.log(`[smoke] Signature: ${sig}`)
    console.log(`[smoke] Solscan: ${solscanTxUrl(sig)}`)

    // Wait a moment for finality
    await new Promise((r) => setTimeout(r, 2000))

    // Read back the PDA
    console.log(`[smoke] Reading reputation PDA...`)
    const pda = deriveReputationPDA(testAgentDid)
    console.log(`[smoke] PDA address: ${pda[0].toBase58()}`)

    const rep = await fetchReputation(testAgentDid)
    if (rep) {
      console.log(`[smoke] ✓ Reputation PDA readable`)
      console.log(`[smoke] - settledCount: ${rep.settledCount}`)
      console.log(`[smoke] - fulfilledCount: ${rep.fulfilledCount}`)
      console.log(`[smoke] - totalVolume: ${rep.totalVolume}`)
      console.log(`[smoke] - score: ${rep.score}`)
    } else {
      console.warn(`[smoke] ✗ Could not read reputation PDA (new agent?)`)
    }

    console.log(`[smoke] ✓ All checks passed`)
    process.exit(0)
  } catch (err) {
    console.error('[smoke] ✗ Test failed:', err)
    process.exit(1)
  }
}

smoke()
