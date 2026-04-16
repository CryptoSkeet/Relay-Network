/**
 * Relay Verify — Public Output Verification API
 *
 * POST /api/v1/agents/verify-output
 *
 * Anyone can verify an agent's output signature against the on-chain
 * model commitment. No authentication required — this is a public
 * cryptographic verification endpoint.
 *
 * Body:
 *   agent_did    string   required – The agent's DID (did:relay:...) or public key hex
 *   input        string   required – The original input/task
 *   output       string   required – The agent's output/response
 *   signature    string   required – Hex-encoded Ed25519 signature
 *   model_hash   string   optional – Expected model hash (hex) for offline verification
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAgentOutput, fetchModelCommitment, deriveModelCommitmentPDA } from '@/lib/solana/relay-verify'
import { solscanUrl } from '@/lib/solana/agent-registry'
import { getSolanaConnection } from '@/lib/solana/quicknode'
import { PublicKey } from '@solana/web3.js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { agent_did, input, output, signature, model_hash } = body

    if (!agent_did || !input || !output || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_did, input, output, signature' },
        { status: 400 }
      )
    }

    // Validate signature format (128 hex chars = 64 bytes Ed25519 sig)
    if (!/^[0-9a-fA-F]{128}$/.test(signature)) {
      return NextResponse.json({ error: 'Invalid signature format (expected 128 hex chars)' }, { status: 400 })
    }

    // Resolve public key from DID or raw hex
    const supabase = await createClient()
    let publicKeyHex: string
    let agentHandle: string | null = null
    let agentId: string | null = null

    if (agent_did.startsWith('did:relay:')) {
      // Look up by DID
      const { data: identity } = await supabase
        .from('agent_identities')
        .select('public_key, agent_id')
        .eq('did', agent_did)
        .maybeSingle()

      if (!identity) {
        return NextResponse.json({ error: 'Agent DID not found' }, { status: 404 })
      }

      publicKeyHex = identity.public_key
      agentId = identity.agent_id

      const { data: agent } = await supabase
        .from('agents')
        .select('handle, model_hash')
        .eq('id', identity.agent_id)
        .maybeSingle()

      agentHandle = agent?.handle ?? null
    } else if (/^[0-9a-fA-F]{64}$/.test(agent_did)) {
      // Raw public key hex
      publicKeyHex = agent_did

      const { data: identity } = await supabase
        .from('agent_identities')
        .select('agent_id')
        .eq('public_key', agent_did)
        .maybeSingle()

      if (identity) {
        agentId = identity.agent_id
        const { data: agent } = await supabase
          .from('agents')
          .select('handle')
          .eq('id', identity.agent_id)
          .maybeSingle()
        agentHandle = agent?.handle ?? null
      }
    } else {
      return NextResponse.json(
        { error: 'agent_did must be a DID (did:relay:...) or 64-char hex public key' },
        { status: 400 }
      )
    }

    // Attempt on-chain commitment verification
    let commitmentFound = false
    let commitmentAddress: string | null = null
    let committedModelHash: string | null = null
    let committedAt: number | null = null
    let onChainVerified = false

    try {
      const connection = getSolanaConnection()
      // Derive Solana pubkey from Ed25519 hex (first 32 bytes of the verification key)
      const didPubkey = new PublicKey(Buffer.from(publicKeyHex, 'hex'))
      const commitment = await fetchModelCommitment(connection, didPubkey)

      if (commitment) {
        commitmentFound = true
        commitmentAddress = commitment.address.toBase58()
        committedModelHash = commitment.modelHash.toString('hex')
        committedAt = commitment.committedAt

        // Verify signature against committed model hash
        onChainVerified = verifyAgentOutput(
          input, output, commitment.modelHash, signature, publicKeyHex
        )
      }
    } catch (err) {
      // On-chain fetch may fail (network issues, program not deployed)
      console.warn('[verify-output] On-chain commitment fetch error:', err)
    }

    // If no on-chain commitment, try offline verification with provided model_hash
    let offlineVerified = false
    if (model_hash && /^[0-9a-fA-F]{64}$/.test(model_hash)) {
      offlineVerified = verifyAgentOutput(
        input, output, model_hash, signature, publicKeyHex
      )
    }

    const valid = onChainVerified || offlineVerified

    return NextResponse.json({
      valid,
      verification: {
        signatureValid: valid,
        method: onChainVerified ? 'on-chain' : offlineVerified ? 'offline' : 'failed',
        commitment: commitmentFound ? {
          found: true,
          address: commitmentAddress,
          modelHash: committedModelHash,
          committedAt: committedAt ? new Date(committedAt * 1000).toISOString() : null,
          solscanUrl: commitmentAddress ? solscanUrl(commitmentAddress) : null,
        } : {
          found: false,
        },
      },
      agent: {
        did: agent_did.startsWith('did:relay:') ? agent_did : null,
        handle: agentHandle,
        publicKey: publicKeyHex,
      },
    })
  } catch (err) {
    console.error('[verify-output] Error:', err)
    return NextResponse.json(
      { error: 'Verification failed', detail: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// GET: show usage information
export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/v1/agents/verify-output',
    description: 'Verify an agent output signature against the on-chain model commitment (Relay Verify)',
    body: {
      agent_did: 'string — Agent DID (did:relay:...) or 64-char hex public key',
      input: 'string — The original input/task given to the agent',
      output: 'string — The agent response to verify',
      signature: 'string — 128-char hex Ed25519 signature from relayVerify.signature',
      model_hash: 'string (optional) — 64-char hex model hash for offline verification',
    },
    example: {
      agent_did: 'did:relay:abc123...',
      input: 'Summarize the latest DeFi trends',
      output: 'Here are the latest trends...',
      signature: 'abcdef0123456789...',
    },
  })
}
