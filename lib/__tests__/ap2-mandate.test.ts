import { describe, expect, it } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { randomBytes } from 'crypto'
import {
  buildContractMandate,
  canonicalJson,
  computeMandateHash,
  computeMandateHashBuffer,
  signMandate,
  verifyMandate,
  MANDATE_VERSION,
  type SignedMandate,
} from '../ap2/mandate'

const FIXED_NONCE = 'a'.repeat(32)
const FIXED_TS = 1_700_000_000_000

function generateDid() {
  const priv = randomBytes(32)
  const pub = ed25519.getPublicKey(priv)
  return {
    privHex: Buffer.from(priv).toString('hex'),
    pubHex: Buffer.from(pub).toString('hex'),
  }
}

function basicInput(overrides: Partial<Parameters<typeof buildContractMandate>[0]> = {}) {
  return {
    contract_id: 'contract-1',
    hiring_agent_did: 'did:relay:abc',
    title: 'Write a research report',
    description: 'A thorough report on Solana DePIN.',
    deliverables: ['draft', 'final'],
    amount_relay: 25,
    issued_at: FIXED_TS,
    nonce: FIXED_NONCE,
    ...overrides,
  }
}

describe('canonicalJson', () => {
  it('produces deterministic output regardless of insertion order', () => {
    const a = canonicalJson({ b: 2, a: 1, c: { y: 1, x: 2 } })
    const b = canonicalJson({ c: { x: 2, y: 1 }, a: 1, b: 2 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":1,"b":2,"c":{"x":2,"y":1}}')
  })

  it('handles arrays and nulls correctly', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalJson({ a: null, b: [{ z: 1, a: 2 }] })).toBe('{"a":null,"b":[{"a":2,"z":1}]}')
  })
})

describe('buildContractMandate', () => {
  it('produces a valid AP2 mandate with all required fields', () => {
    const m = buildContractMandate(basicInput())
    expect(m.version).toBe(MANDATE_VERSION)
    expect(m.contract_id).toBe('contract-1')
    expect(m.scope.deliverables).toEqual(['draft', 'final'])
    expect(m.escrow).toEqual({ amount: 25, currency: 'RELAY' })
    expect(m.completion_criteria).toEqual(['draft', 'final']) // defaults to deliverables
    expect(m.issued_at).toBe(FIXED_TS)
    expect(m.nonce).toBe(FIXED_NONCE)
    expect(m.provider_agent_did).toBeNull()
  })

  it('honors explicit completion_criteria', () => {
    const m = buildContractMandate(
      basicInput({ completion_criteria: ['report >= 1000 words', 'cites >= 5 sources'] }),
    )
    expect(m.completion_criteria).toEqual(['report >= 1000 words', 'cites >= 5 sources'])
  })

  it('rejects missing or invalid inputs', () => {
    expect(() => buildContractMandate(basicInput({ contract_id: '' }))).toThrow()
    expect(() => buildContractMandate(basicInput({ deliverables: [] }))).toThrow()
    expect(() => buildContractMandate(basicInput({ amount_relay: 0 }))).toThrow()
    expect(() => buildContractMandate(basicInput({ amount_relay: -1 }))).toThrow()
    expect(() => buildContractMandate(basicInput({ amount_relay: NaN }))).toThrow()
  })

  it('generates a unique nonce when not provided', () => {
    const a = buildContractMandate(basicInput({ nonce: undefined }))
    const b = buildContractMandate(basicInput({ nonce: undefined }))
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.nonce).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('computeMandateHash', () => {
  it('is deterministic for the same mandate', () => {
    const m = buildContractMandate(basicInput())
    expect(computeMandateHash(m)).toBe(computeMandateHash(m))
  })

  it('is order-independent at the JSON level', () => {
    const m1 = buildContractMandate(basicInput())
    // Reconstruct with shuffled keys — same canonical hash
    const m2 = JSON.parse(JSON.stringify(m1))
    expect(computeMandateHash(m1)).toBe(computeMandateHash(m2))
  })

  it('changes when any field changes', () => {
    const base = computeMandateHash(buildContractMandate(basicInput()))
    expect(base).not.toBe(
      computeMandateHash(buildContractMandate(basicInput({ amount_relay: 26 }))),
    )
    expect(base).not.toBe(
      computeMandateHash(buildContractMandate(basicInput({ deliverables: ['draft'] }))),
    )
    expect(base).not.toBe(
      computeMandateHash(buildContractMandate(basicInput({ description: 'different' }))),
    )
    expect(base).not.toBe(
      computeMandateHash(buildContractMandate(basicInput({ nonce: 'b'.repeat(32) }))),
    )
  })

  it('returns a 32-byte buffer / 64-char hex string', () => {
    const m = buildContractMandate(basicInput())
    expect(computeMandateHashBuffer(m)).toHaveLength(32)
    expect(computeMandateHash(m)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('signMandate / verifyMandate', () => {
  it('round-trips signing and verification', () => {
    const { privHex, pubHex } = generateDid()
    const m = buildContractMandate(basicInput())
    const signed = signMandate(m, privHex)
    expect(signed.signer_pubkey).toBe(pubHex)
    expect(signed.signature).toMatch(/^[0-9a-f]{128}$/)

    const result = verifyMandate(signed)
    expect(result.valid).toBe(true)
    expect(result.hashMatch).toBe(true)
    expect(result.signatureValid).toBe(true)
  })

  it('detects mandate tampering (hash mismatch)', () => {
    const { privHex } = generateDid()
    const m = buildContractMandate(basicInput())
    const signed = signMandate(m, privHex)
    const tampered: SignedMandate = {
      ...signed,
      mandate: { ...m, scope: { ...m.scope, title: 'EVIL' } },
    }
    const result = verifyMandate(tampered)
    expect(result.valid).toBe(false)
    expect(result.hashMatch).toBe(false)
    expect(result.reason).toMatch(/tampered/i)
  })

  it('detects signature tampering', () => {
    const { privHex } = generateDid()
    const m = buildContractMandate(basicInput())
    const signed = signMandate(m, privHex)
    // Flip one byte of the signature
    const sigBuf = Buffer.from(signed.signature, 'hex')
    sigBuf[0] = sigBuf[0] ^ 0xff
    const tampered = { ...signed, signature: sigBuf.toString('hex') }
    const result = verifyMandate(tampered)
    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
  })

  it('rejects signatures from a different signer', () => {
    const a = generateDid()
    const b = generateDid()
    const m = buildContractMandate(basicInput())
    const signed = signMandate(m, a.privHex)
    // Replace pubkey with a different one — signature no longer valid against it
    const wrongSigner = { ...signed, signer_pubkey: b.pubHex }
    expect(verifyMandate(wrongSigner).valid).toBe(false)
  })
})
