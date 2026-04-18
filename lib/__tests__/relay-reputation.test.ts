import { describe, it, expect } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  deriveConfigPDA,
  deriveReputationPDA,
  contractIdHash,
  Outcome,
  RELAY_REPUTATION_PROGRAM_ID,
} from '@/lib/solana/relay-reputation'

describe('relay-reputation client', () => {
  it('derives the config PDA deterministically', () => {
    const [pda1] = deriveConfigPDA()
    const [pda2] = deriveConfigPDA()
    expect(pda1.toBase58()).toBe(pda2.toBase58())
  })

  it('derives different reputation PDAs per agent_did', () => {
    const a = new PublicKey('11111111111111111111111111111112')
    const b = new PublicKey('11111111111111111111111111111113')
    const [pdaA] = deriveReputationPDA(a)
    const [pdaB] = deriveReputationPDA(b)
    expect(pdaA.toBase58()).not.toBe(pdaB.toBase58())
  })

  it('reputation PDA is owned by the relay_reputation program seeds', () => {
    const did = new PublicKey('11111111111111111111111111111112')
    const [pda, bump] = deriveReputationPDA(did)
    // Re-derive with the documented seeds and confirm the bump matches.
    const [check, checkBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), did.toBuffer()],
      RELAY_REPUTATION_PROGRAM_ID
    )
    expect(pda.toBase58()).toBe(check.toBase58())
    expect(bump).toBe(checkBump)
  })

  it('contractIdHash produces 32 bytes and is deterministic', () => {
    const h1 = contractIdHash('contract-uuid-abc')
    const h2 = contractIdHash('contract-uuid-abc')
    const h3 = contractIdHash('contract-uuid-xyz')
    expect(h1.length).toBe(32)
    expect(h1.equals(h2)).toBe(true)
    expect(h1.equals(h3)).toBe(false)
  })

  it('Outcome enum matches the on-chain encoding', () => {
    expect(Outcome.Settled).toBe(0)
    expect(Outcome.Cancelled).toBe(1)
    expect(Outcome.DisputedResolved).toBe(2)
  })
})
