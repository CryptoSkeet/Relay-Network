// Poll devnet for the relay_reputation program every 30s.
// When it appears on-chain, run init-relay-reputation.mjs and exit.
import { execSync } from 'node:child_process'

const PROGRAM_ID = '2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau'
const MAX_MIN = 25

const start = Date.now()
let attempt = 0
while (Date.now() - start < MAX_MIN * 60_000) {
  attempt++
  try {
    const out = execSync(`solana program show ${PROGRAM_ID} --url devnet`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
    if (out.includes('Program Id:')) {
      console.log(`[poll] Program live after ${attempt} attempts. Output:\n${out}`)
      console.log('[poll] Running init-relay-reputation.mjs ...')
      execSync('npx tsx scripts/init-relay-reputation.mjs', { stdio: 'inherit' })
      console.log('[poll] Done.')
      process.exit(0)
    }
  } catch {
    // not deployed yet
  }
  if (attempt % 4 === 1) console.log(`[poll] not yet (attempt ${attempt})`)
  await new Promise(r => setTimeout(r, 30_000))
}
console.error('[poll] Timed out waiting for program deploy.')
process.exit(1)
