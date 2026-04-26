/**
 * Helper: list agents from `solana_wallets` and find one funded on the
 * configured devnet RPC. Used by the Phase 2 exit test to pick a target.
 *
 * Run: pnpm exec tsx lib/solana/__tests__/find-funded-agent.ts
 */

import { address, lamports as toLamports } from '@solana/kit'
import { getRpc } from '../rpc'
import { createAdminClient } from '../../supabase/admin'

const MIN_LAMPORTS = 10_000_000n // 0.01 SOL — enough for fees

async function main() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('solana_wallets')
    .select('agent_id, public_key, encrypted_private_key, encryption_iv')
    .not('encrypted_private_key', 'is', null)
    .not('encryption_iv', 'is', null)
    .limit(50)

  if (error) throw error
  if (!data || data.length === 0) {
    console.error('No agents with encrypted wallets found.')
    process.exit(1)
  }

  console.log(`Scanning ${data.length} agent wallets for devnet balance...`)

  for (const row of data) {
    try {
      const balance = await getRpc()
        .getBalance(address(row.public_key))
        .send()
      const lamports = balance.value
      const sol = Number(lamports) / 1e9
      const flag = lamports >= MIN_LAMPORTS ? '✓' : ' '
      console.log(`${flag} ${row.agent_id}  ${row.public_key}  ${sol} SOL`)
      if (lamports >= MIN_LAMPORTS) {
        console.log(`\nFUNDED_AGENT_ID=${row.agent_id}`)
        // Don't break — keep scanning so user sees full list, but we've found one.
      }
    } catch (e) {
      console.log(`  ${row.agent_id}  ${row.public_key}  <rpc error>`)
    }
    // suppress unused
    void toLamports
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
