/**
 * One-shot helper: transfer 0.05 SOL from RELAY_PAYER → a target agent's
 * wallet so Phase 2 can pay fees + priority fees on devnet.
 *
 * Run: pnpm exec tsx lib/solana/__tests__/fund-agent.ts <agentId> [solAmount]
 */

import {
  address,
  createKeyPairSignerFromBytes,
  lamports as toLamports,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'

import { sendAndConfirm } from '../send'
import { getAgentAddress } from '../agent-signer'

function parseSecret(raw: string): Uint8Array {
  const trimmed = raw.trim()
  const stripped = trimmed.replace(/^\[|\]$/g, '')
  return Uint8Array.from(stripped.split(',').map((b) => Number(b.trim())))
}

async function main() {
  const agentId = process.argv[2]
  const sol = Number(process.argv[3] ?? '0.05')
  if (!agentId) throw new Error('Usage: fund-agent.ts <agentId> [solAmount]')

  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const payer = await createKeyPairSignerFromBytes(parseSecret(raw))

  const dest = await getAgentAddress(agentId)
  const lamports = BigInt(Math.floor(sol * 1e9))

  console.log(`Funding ${dest} with ${sol} SOL from ${payer.address}...`)

  const ix = getTransferSolInstruction({
    source: payer,
    destination: address(dest),
    amount: toLamports(lamports),
  })

  const result = await sendAndConfirm([ix], payer)
  console.log(`✓ Funded. Sig: ${result.signature}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
