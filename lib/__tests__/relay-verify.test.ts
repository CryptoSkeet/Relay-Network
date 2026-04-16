/**
 * Relay Verify — E2E tests for the three-layer output verification system
 * and zkML upgrade path.
 *
 * Covers:
 *   Layer 1 — Commitment hashing (model hash, prompt hash)
 *   Layer 2 — Ed25519 output signing + verification
 *   Layer 3 — Full verify flow (offline + on-chain mock)
 *   PDA derivation determinism
 *   zkML proof interface (upgrade path)
 *   End-to-end round-trip (generate → sign → verify)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes, createHash } from 'crypto'
import { ed25519 } from '@noble/curves/ed25519'
import {
  computeModelHash,
  computePromptHash,
  computeOutputDigest,
  signAgentOutput,
  verifyAgentOutput,
  verifyOutputFull,
  deriveModelCommitmentPDA,
  fetchModelCommitment,
  buildCommitModelIx,
  buildUpdateCommitmentIx,
} from '../solana/relay-verify'
import type { VerifyResult } from '../solana/relay-verify'
import { generateKeypair, encryptPrivateKey, decryptPrivateKey } from '../crypto/identity'
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

const toHex = (b: Uint8Array | Buffer) => Buffer.from(b).toString('hex')

function makeKeypair() {
  const privateKey = randomBytes(32)
  const publicKey = ed25519.getPublicKey(privateKey)
  return { privateKey: toHex(privateKey), publicKey: toHex(publicKey) }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 1 — Commitment Hashing
// ═══════════════════════════════════════════════════════════════════════════════

describe('Layer 1 — Commitment Hashing', () => {
  it('computeModelHash returns a 32-byte Buffer', () => {
    const hash = computeModelHash('claude-3.5-sonnet', '1.0', 'You are helpful.', ['search', 'code-review'])
    expect(hash).toBeInstanceOf(Buffer)
    expect(hash.length).toBe(32)
  })

  it('computeModelHash is deterministic', () => {
    const args: [string, string, string, string[]] = [
      'claude-3.5-sonnet', '1.0', 'You are a coding agent.', ['search', 'code-review', 'deploy']
    ]
    const h1 = computeModelHash(...args)
    const h2 = computeModelHash(...args)
    expect(h1.equals(h2)).toBe(true)
  })

  it('computeModelHash sorts tool list before hashing', () => {
    const h1 = computeModelHash('model', '1', 'prompt', ['z-tool', 'a-tool', 'm-tool'])
    const h2 = computeModelHash('model', '1', 'prompt', ['a-tool', 'm-tool', 'z-tool'])
    expect(h1.equals(h2)).toBe(true)
  })

  it('computeModelHash changes when any input changes', () => {
    const base = computeModelHash('model', '1', 'prompt', ['tool'])
    const diffModel = computeModelHash('other-model', '1', 'prompt', ['tool'])
    const diffVersion = computeModelHash('model', '2', 'prompt', ['tool'])
    const diffPrompt = computeModelHash('model', '1', 'different prompt', ['tool'])
    const diffTools = computeModelHash('model', '1', 'prompt', ['other-tool'])

    expect(base.equals(diffModel)).toBe(false)
    expect(base.equals(diffVersion)).toBe(false)
    expect(base.equals(diffPrompt)).toBe(false)
    expect(base.equals(diffTools)).toBe(false)
  })

  it('computePromptHash returns a 32-byte Buffer', () => {
    const hash = computePromptHash('You are a helpful assistant.')
    expect(hash).toBeInstanceOf(Buffer)
    expect(hash.length).toBe(32)
  })

  it('computePromptHash is deterministic', () => {
    const h1 = computePromptHash('System prompt v1')
    const h2 = computePromptHash('System prompt v1')
    expect(h1.equals(h2)).toBe(true)
  })

  it('computePromptHash differs for different prompts', () => {
    const h1 = computePromptHash('Prompt A')
    const h2 = computePromptHash('Prompt B')
    expect(h1.equals(h2)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 2 — Ed25519 Output Signing
// ═══════════════════════════════════════════════════════════════════════════════

describe('Layer 2 — Output Signing & Verification', () => {
  const keys = makeKeypair()
  const modelHash = computeModelHash('claude-3.5-sonnet', '1.0', 'You are helpful.', ['search'])

  it('signAgentOutput returns a 128-char hex string (64 bytes)', () => {
    const sig = signAgentOutput('hello', 'world', modelHash, keys.privateKey)
    expect(sig).toMatch(/^[0-9a-f]{128}$/)
  })

  it('verifyAgentOutput returns true for valid signature', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const valid = verifyAgentOutput('input', 'output', modelHash, sig, keys.publicKey)
    expect(valid).toBe(true)
  })

  it('verifyAgentOutput returns false for wrong input', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const valid = verifyAgentOutput('WRONG', 'output', modelHash, sig, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('verifyAgentOutput returns false for wrong output', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const valid = verifyAgentOutput('input', 'TAMPERED', modelHash, sig, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('verifyAgentOutput returns false for wrong model hash', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const wrongHash = computeModelHash('different-model', '1.0', 'prompt', ['tool'])
    const valid = verifyAgentOutput('input', 'output', wrongHash, sig, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('verifyAgentOutput returns false for wrong public key', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const other = makeKeypair()
    const valid = verifyAgentOutput('input', 'output', modelHash, sig, other.publicKey)
    expect(valid).toBe(false)
  })

  it('verifyAgentOutput returns false for corrupted signature', () => {
    const sig = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const corrupted = 'ff' + sig.slice(2) // flip first byte
    const valid = verifyAgentOutput('input', 'output', modelHash, corrupted, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('verifyAgentOutput returns false for invalid hex', () => {
    const valid = verifyAgentOutput('input', 'output', modelHash, 'not-valid-hex', keys.publicKey)
    expect(valid).toBe(false)
  })

  it('accepts model hash as hex string', () => {
    const hashHex = modelHash.toString('hex')
    const sig = signAgentOutput('input', 'output', hashHex, keys.privateKey)
    const valid = verifyAgentOutput('input', 'output', hashHex, sig, keys.publicKey)
    expect(valid).toBe(true)
  })

  it('Buffer model hash and hex string model hash produce same signature', () => {
    const sig1 = signAgentOutput('input', 'output', modelHash, keys.privateKey)
    const sig2 = signAgentOutput('input', 'output', modelHash.toString('hex'), keys.privateKey)
    expect(sig1).toBe(sig2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Output Digest
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeOutputDigest', () => {
  it('returns 32-byte Buffer', () => {
    const digest = computeOutputDigest('in', 'out', computeModelHash('m', '1', 'p', ['t']))
    expect(digest).toBeInstanceOf(Buffer)
    expect(digest.length).toBe(32)
  })

  it('is deterministic', () => {
    const mh = computeModelHash('m', '1', 'p', ['t'])
    const d1 = computeOutputDigest('in', 'out', mh)
    const d2 = computeOutputDigest('in', 'out', mh)
    expect(d1.equals(d2)).toBe(true)
  })

  it('changes when input differs', () => {
    const mh = computeModelHash('m', '1', 'p', ['t'])
    const d1 = computeOutputDigest('a', 'out', mh)
    const d2 = computeOutputDigest('b', 'out', mh)
    expect(d1.equals(d2)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PDA Derivation
// ═══════════════════════════════════════════════════════════════════════════════

describe('PDA Derivation', () => {
  it('deriveModelCommitmentPDA returns deterministic [PublicKey, number]', () => {
    const kp = Keypair.generate()
    const [pda1, bump1] = deriveModelCommitmentPDA(kp.publicKey)
    const [pda2, bump2] = deriveModelCommitmentPDA(kp.publicKey)
    expect(pda1.equals(pda2)).toBe(true)
    expect(bump1).toBe(bump2)
    expect(typeof bump1).toBe('number')
  })

  it('different DID keys produce different PDAs', () => {
    const kp1 = Keypair.generate()
    const kp2 = Keypair.generate()
    const [pda1] = deriveModelCommitmentPDA(kp1.publicKey)
    const [pda2] = deriveModelCommitmentPDA(kp2.publicKey)
    expect(pda1.equals(pda2)).toBe(false)
  })

  it('PDA is off the Ed25519 curve', () => {
    const kp = Keypair.generate()
    const [pda] = deriveModelCommitmentPDA(kp.publicKey)
    // PDA should not be on Ed25519 curve — PublicKey.isOnCurve should be false
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Transaction Instruction Builders
// ═══════════════════════════════════════════════════════════════════════════════

describe('Instruction Builders', () => {
  const didAuthority = Keypair.generate().publicKey
  const payer = Keypair.generate().publicKey
  const modelHash = computeModelHash('m', '1', 'p', ['t'])
  const promptHash = computePromptHash('p')

  it('buildCommitModelIx returns a valid TransactionInstruction', () => {
    const ix = buildCommitModelIx(didAuthority, payer, modelHash, promptHash)
    expect(ix.keys).toHaveLength(4) // didAuthority, commitmentPDA, payer, systemProgram
    expect(ix.keys[0].pubkey.equals(didAuthority)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys[2].pubkey.equals(payer)).toBe(true)
    expect(ix.keys[3].pubkey.equals(SystemProgram.programId)).toBe(true)
    // data = 8 (disc) + 32 (model_hash) + 32 (prompt_hash) = 72 bytes
    expect(ix.data.length).toBe(72)
  })

  it('buildUpdateCommitmentIx returns a valid TransactionInstruction', () => {
    const ix = buildUpdateCommitmentIx(didAuthority, modelHash, promptHash)
    expect(ix.keys).toHaveLength(2) // didAuthority, commitmentPDA
    expect(ix.keys[0].pubkey.equals(didAuthority)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.data.length).toBe(72)
  })

  it('instruction PDAs match deriveModelCommitmentPDA', () => {
    const [expectedPDA] = deriveModelCommitmentPDA(didAuthority)
    const ix = buildCommitModelIx(didAuthority, payer, modelHash, promptHash)
    expect(ix.keys[1].pubkey.equals(expectedPDA)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Key Encryption Round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('Key Encryption Round-trip', () => {
  it('encrypt → decrypt recovers original private key', () => {
    const keys = makeKeypair()
    const { encryptedKey, iv } = encryptPrivateKey(keys.privateKey)
    const recovered = decryptPrivateKey(encryptedKey, iv)
    expect(recovered).toBe(keys.privateKey)
  })

  it('decrypted key can sign and verify correctly', () => {
    const keys = makeKeypair()
    const { encryptedKey, iv } = encryptPrivateKey(keys.privateKey)
    const recoveredPrivate = decryptPrivateKey(encryptedKey, iv)

    const mh = computeModelHash('model', '1', 'prompt', ['tool'])
    const sig = signAgentOutput('task', 'result', mh, recoveredPrivate)
    const valid = verifyAgentOutput('task', 'result', mh, sig, keys.publicKey)
    expect(valid).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Full E2E Round-trip (no network)
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E Round-trip — generate → hash → sign → verify', () => {
  it('full agent lifecycle: keygen → model commit hash → sign output → verify', async () => {
    // Step 1: Generate agent keypair (like agent creation does)
    const { publicKey, privateKey } = await generateKeypair()

    // Step 2: Compute model hash (like agent creation does)
    const modelHash = computeModelHash(
      'claude-3.5-sonnet',
      '1.0.0',
      'You are an autonomous coding agent for the Relay network.',
      ['search_marketplace', 'bid_on_contract', 'submit_work', 'create_post']
    )
    const promptHash = computePromptHash(
      'You are an autonomous coding agent for the Relay network.'
    )

    // Step 3: Encrypt and store private key (like agent creation does)
    const { encryptedKey, iv } = encryptPrivateKey(privateKey)

    // Step 4: Agent receives a task and produces output (like /api/agents/run)
    const task = 'Summarize the latest DeFi trends for a 5-minute read'
    const agentOutput = 'Here are the top 5 DeFi trends: 1) Real-world asset tokenization...'

    // Step 5: Decrypt key and sign the output
    const recoveredKey = decryptPrivateKey(encryptedKey, iv)
    const signature = signAgentOutput(task, agentOutput, modelHash, recoveredKey)

    // Step 6: Third party verifies (like /api/v1/agents/verify-output)
    const isValid = verifyAgentOutput(task, agentOutput, modelHash, signature, publicKey)
    expect(isValid).toBe(true)

    // Step 7: Tampered output is rejected
    const tampered = verifyAgentOutput(task, 'FAKE OUTPUT', modelHash, signature, publicKey)
    expect(tampered).toBe(false)

    // Step 8: Tampered input is rejected
    const tamperedInput = verifyAgentOutput('different task', agentOutput, modelHash, signature, publicKey)
    expect(tamperedInput).toBe(false)
  })

  it('model config change invalidates old signatures', async () => {
    const { publicKey, privateKey } = await generateKeypair()

    const modelHashV1 = computeModelHash('claude-3.5-sonnet', '1.0', 'prompt v1', ['tool-a'])
    const modelHashV2 = computeModelHash('claude-3.5-sonnet', '2.0', 'prompt v2', ['tool-a', 'tool-b'])

    const sig = signAgentOutput('task', 'output', modelHashV1, privateKey)

    // Valid against v1
    expect(verifyAgentOutput('task', 'output', modelHashV1, sig, publicKey)).toBe(true)
    // Invalid against v2
    expect(verifyAgentOutput('task', 'output', modelHashV2, sig, publicKey)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// verifyOutputFull (mocked on-chain)
// ═══════════════════════════════════════════════════════════════════════════════

describe('verifyOutputFull — with mocked connection', () => {
  const keys = makeKeypair()
  const modelHash = computeModelHash('claude-3.5-sonnet', '1.0', 'prompt', ['tool'])
  const promptHash = computePromptHash('prompt')

  function mockConnection(accountData: Buffer | null) {
    return {
      getAccountInfo: vi.fn().mockResolvedValue(
        accountData
          ? { data: accountData, lamports: 1_000_000, owner: new PublicKey('11111111111111111111111111111111'), executable: false }
          : null
      ),
    } as any
  }

  it('returns commitmentFound=false when no PDA account', async () => {
    const conn = mockConnection(null)
    const sig = signAgentOutput('in', 'out', modelHash, keys.privateKey)

    const result = await verifyOutputFull(conn, 'in', 'out', sig, keys.publicKey)
    expect(result.commitmentFound).toBe(false)
    expect(result.valid).toBe(false)
  })

  it('returns valid=true with offline model_hash when no PDA', async () => {
    const conn = mockConnection(null)
    const sig = signAgentOutput('in', 'out', modelHash, keys.privateKey)

    const result = await verifyOutputFull(conn, 'in', 'out', sig, keys.publicKey, modelHash)
    expect(result.commitmentFound).toBe(false)
    expect(result.signatureValid).toBe(true)
    expect(result.valid).toBe(true)
  })

  it('handles connection errors gracefully', async () => {
    const conn = {
      getAccountInfo: vi.fn().mockRejectedValue(new Error('network timeout')),
    } as any
    const sig = signAgentOutput('in', 'out', modelHash, keys.privateKey)

    const result = await verifyOutputFull(conn, 'in', 'out', sig, keys.publicKey)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('network timeout')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// zkML Upgrade Path — Interface Contracts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * These tests define the expected interface for a future zkML proof system.
 * They validate that the current verification layer is forward-compatible:
 * - A zkML proof can be attached alongside Ed25519 signatures
 * - The verify-output response shape supports a `proof` field
 * - Model hash commitment links to the same circuit identity
 *
 * When EZKL or RISC Zero is integrated, these stubs become real implementations.
 */

// ── zkML proof interface (future) ─────────────────────────────────────────────

interface ZkMLProof {
  /** Proof system identifier */
  prover: 'ezkl' | 'risc-zero' | 'stub'
  /** Hex-encoded proof blob */
  proofData: string
  /** Model circuit hash — must match the committed model hash */
  circuitHash: string
  /** Public inputs hash (input + output digest) */
  publicInputsHash: string
  /** Verification key hash for the circuit */
  verificationKeyHash: string
  /** Timestamp of proof generation */
  generatedAt: number
}

interface ZkMLVerifyResult extends VerifyResult {
  zkProof?: {
    verified: boolean
    prover: string
    circuitHashMatch: boolean
  }
}

/** Stub zkML prover — produces a deterministic "proof" from the inputs */
function stubZkMLProve(
  input: string,
  output: string,
  modelHash: Buffer
): ZkMLProof {
  const publicInputsHash = createHash('sha256')
    .update(input + '|' + output)
    .digest('hex')

  const proofData = createHash('sha256')
    .update('zkml-stub-proof:' + publicInputsHash + ':' + modelHash.toString('hex'))
    .digest('hex')

  return {
    prover: 'stub',
    proofData,
    circuitHash: modelHash.toString('hex'),
    publicInputsHash,
    verificationKeyHash: createHash('sha256').update('stub-vk').digest('hex'),
    generatedAt: Math.floor(Date.now() / 1000),
  }
}

/** Stub zkML verifier — checks proof structure and circuit hash match */
function stubZkMLVerify(
  proof: ZkMLProof,
  input: string,
  output: string,
  committedModelHash: Buffer
): { verified: boolean; circuitHashMatch: boolean } {
  // Check circuit hash matches the committed model hash
  const circuitHashMatch = proof.circuitHash === committedModelHash.toString('hex')

  // Check public inputs hash matches
  const expectedPublicInputsHash = createHash('sha256')
    .update(input + '|' + output)
    .digest('hex')
  const publicInputsMatch = proof.publicInputsHash === expectedPublicInputsHash

  // "Verify" the proof (in real impl, this calls the proof system verifier)
  const expectedProofData = createHash('sha256')
    .update('zkml-stub-proof:' + expectedPublicInputsHash + ':' + committedModelHash.toString('hex'))
    .digest('hex')
  const proofValid = proof.proofData === expectedProofData

  return {
    verified: circuitHashMatch && publicInputsMatch && proofValid,
    circuitHashMatch,
  }
}

/**
 * Combined verification: Ed25519 signature + zkML proof.
 * This is the target architecture when zkML is integrated.
 */
async function verifyWithZkML(
  input: string,
  output: string,
  signatureHex: string,
  publicKeyHex: string,
  modelHash: Buffer,
  zkProof?: ZkMLProof
): Promise<ZkMLVerifyResult> {
  // Layer 2: Ed25519 signature verification
  const sigValid = verifyAgentOutput(input, output, modelHash, signatureHex, publicKeyHex)

  const result: ZkMLVerifyResult = {
    valid: sigValid,
    signatureValid: sigValid,
    commitmentFound: true, // assumed for this test
  }

  // Layer 3+: zkML proof verification (optional upgrade)
  if (zkProof) {
    const zkResult = stubZkMLVerify(zkProof, input, output, modelHash)
    result.zkProof = {
      verified: zkResult.verified,
      prover: zkProof.prover,
      circuitHashMatch: zkResult.circuitHashMatch,
    }
    // Both must pass for full verification
    result.valid = sigValid && zkResult.verified
  }

  return result
}

describe('zkML Upgrade Path — Interface Contracts', () => {
  const keys = makeKeypair()
  const modelHash = computeModelHash('claude-3.5-sonnet', '1.0', 'You are helpful.', ['search'])

  it('ZkMLProof interface has all required fields', () => {
    const proof = stubZkMLProve('input', 'output', modelHash)
    expect(proof).toHaveProperty('prover')
    expect(proof).toHaveProperty('proofData')
    expect(proof).toHaveProperty('circuitHash')
    expect(proof).toHaveProperty('publicInputsHash')
    expect(proof).toHaveProperty('verificationKeyHash')
    expect(proof).toHaveProperty('generatedAt')
    expect(proof.prover).toBe('stub')
    expect(proof.proofData).toMatch(/^[0-9a-f]{64}$/)
    expect(proof.circuitHash).toBe(modelHash.toString('hex'))
  })

  it('zkML circuitHash matches model commitment hash', () => {
    const proof = stubZkMLProve('task', 'response', modelHash)
    expect(proof.circuitHash).toBe(modelHash.toString('hex'))
  })

  it('stub prover produces deterministic proofs', () => {
    const p1 = stubZkMLProve('in', 'out', modelHash)
    const p2 = stubZkMLProve('in', 'out', modelHash)
    expect(p1.proofData).toBe(p2.proofData)
    expect(p1.publicInputsHash).toBe(p2.publicInputsHash)
  })

  it('different inputs produce different proofs', () => {
    const p1 = stubZkMLProve('input A', 'output', modelHash)
    const p2 = stubZkMLProve('input B', 'output', modelHash)
    expect(p1.proofData).not.toBe(p2.proofData)
  })

  it('stub verifier accepts valid proof', () => {
    const proof = stubZkMLProve('task', 'result', modelHash)
    const { verified, circuitHashMatch } = stubZkMLVerify(proof, 'task', 'result', modelHash)
    expect(verified).toBe(true)
    expect(circuitHashMatch).toBe(true)
  })

  it('stub verifier rejects proof with wrong input', () => {
    const proof = stubZkMLProve('task', 'result', modelHash)
    const { verified } = stubZkMLVerify(proof, 'WRONG', 'result', modelHash)
    expect(verified).toBe(false)
  })

  it('stub verifier rejects proof with wrong output', () => {
    const proof = stubZkMLProve('task', 'result', modelHash)
    const { verified } = stubZkMLVerify(proof, 'task', 'TAMPERED', modelHash)
    expect(verified).toBe(false)
  })

  it('stub verifier rejects proof with wrong model hash', () => {
    const proof = stubZkMLProve('task', 'result', modelHash)
    const wrongHash = computeModelHash('other-model', '1', 'p', ['t'])
    const { verified, circuitHashMatch } = stubZkMLVerify(proof, 'task', 'result', wrongHash)
    expect(circuitHashMatch).toBe(false)
    expect(verified).toBe(false)
  })
})

describe('zkML + Ed25519 Combined Verification', () => {
  const keys = makeKeypair()
  const modelHash = computeModelHash('claude-3.5-sonnet', '1.0', 'prompt', ['tool'])

  it('passes when both signature and zkML proof are valid', async () => {
    const sig = signAgentOutput('task', 'output', modelHash, keys.privateKey)
    const proof = stubZkMLProve('task', 'output', modelHash)

    const result = await verifyWithZkML('task', 'output', sig, keys.publicKey, modelHash, proof)
    expect(result.valid).toBe(true)
    expect(result.signatureValid).toBe(true)
    expect(result.zkProof?.verified).toBe(true)
    expect(result.zkProof?.circuitHashMatch).toBe(true)
  })

  it('fails when signature is valid but zkML proof is invalid', async () => {
    const sig = signAgentOutput('task', 'output', modelHash, keys.privateKey)
    const proof = stubZkMLProve('task', 'DIFFERENT', modelHash) // proof for different output

    const result = await verifyWithZkML('task', 'output', sig, keys.publicKey, modelHash, proof)
    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(true) // sig is still valid
    expect(result.zkProof?.verified).toBe(false)
  })

  it('fails when zkML proof is valid but signature is wrong', async () => {
    const other = makeKeypair()
    const sig = signAgentOutput('task', 'output', modelHash, other.privateKey) // wrong key
    const proof = stubZkMLProve('task', 'output', modelHash)

    const result = await verifyWithZkML('task', 'output', sig, keys.publicKey, modelHash, proof)
    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
    expect(result.zkProof?.verified).toBe(true)
  })

  it('works without zkML proof (backward compatible)', async () => {
    const sig = signAgentOutput('task', 'output', modelHash, keys.privateKey)

    const result = await verifyWithZkML('task', 'output', sig, keys.publicKey, modelHash)
    expect(result.valid).toBe(true)
    expect(result.signatureValid).toBe(true)
    expect(result.zkProof).toBeUndefined()
  })

  it('verify-output response shape supports zkProof extension', async () => {
    const sig = signAgentOutput('task', 'output', modelHash, keys.privateKey)
    const proof = stubZkMLProve('task', 'output', modelHash)
    const result = await verifyWithZkML('task', 'output', sig, keys.publicKey, modelHash, proof)

    // This is the shape the API should return when zkML is enabled
    const apiResponse = {
      valid: result.valid,
      verification: {
        signatureValid: result.signatureValid,
        method: 'offline' as const,
        commitment: { found: true },
        zkProof: result.zkProof,
      },
      agent: {
        did: 'did:relay:abc123',
        handle: 'test-agent',
        publicKey: keys.publicKey,
      },
    }

    expect(apiResponse.verification.zkProof?.verified).toBe(true)
    expect(apiResponse.verification.zkProof?.prover).toBe('stub')
    expect(apiResponse.verification.zkProof?.circuitHashMatch).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Cases & Security
// ═══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases & Security', () => {
  it('empty strings are valid inputs for hashing', () => {
    const hash = computeModelHash('', '', '', [])
    expect(hash.length).toBe(32)
  })

  it('unicode inputs produce stable hashes', () => {
    const h1 = computeModelHash('模型', '版本', '你是助手', ['工具'])
    const h2 = computeModelHash('模型', '版本', '你是助手', ['工具'])
    expect(h1.equals(h2)).toBe(true)
  })

  it('very long inputs do not throw', () => {
    const longStr = 'x'.repeat(100_000)
    expect(() => computeModelHash(longStr, longStr, longStr, [longStr])).not.toThrow()
    expect(() => signAgentOutput(longStr, longStr, computeModelHash('m', '1', 'p', ['t']), makeKeypair().privateKey)).not.toThrow()
  })

  it('signing with all-zero key does not crash', () => {
    const zeroKey = '0'.repeat(64)
    const mh = computeModelHash('m', '1', 'p', ['t'])
    // Should not throw — ed25519 handles zero keys
    expect(() => signAgentOutput('in', 'out', mh, zeroKey)).not.toThrow()
  })

  it('signature is unique per input/output pair', () => {
    const keys = makeKeypair()
    const mh = computeModelHash('m', '1', 'p', ['t'])
    const sig1 = signAgentOutput('a', 'b', mh, keys.privateKey)
    const sig2 = signAgentOutput('a', 'c', mh, keys.privateKey)
    const sig3 = signAgentOutput('c', 'b', mh, keys.privateKey)
    expect(sig1).not.toBe(sig2)
    expect(sig1).not.toBe(sig3)
    expect(sig2).not.toBe(sig3)
  })
})
