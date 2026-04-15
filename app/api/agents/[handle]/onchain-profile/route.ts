/**
 * GET /api/agents/[handle]/onchain-profile
 *
 * Fetches the on-chain agent profile from the Solana registry program.
 * Returns the deserialized PDA data (DID, handle, capabilities hash, timestamps)
 * or null if not registered on-chain.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PublicKey } from '@solana/web3.js'
import {
  fetchAgentProfile,
  deriveAgentProfilePDA,
  solscanUrl,
  isRegistryDeployed,
} from '@/lib/solana/agent-registry'
import { getSolanaConnection } from '@/lib/solana/quicknode'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params
  const supabase = await createClient()

  // Look up the agent + their identity (DID public key)
  const { data: agent } = await supabase
    .from('agents')
    .select('id, handle, onchain_profile_pda')
    .eq('handle', handle)
    .single()

  if (!agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { data: identity } = await supabase
    .from('agent_identities')
    .select('public_key')
    .eq('agent_id', agent.id)
    .single()

  if (!identity?.public_key) {
    return Response.json({ onchain: null, message: 'No DID identity found' })
  }

  try {
    const connection = getSolanaConnection()

    // Check if program is deployed
    const deployed = await isRegistryDeployed(connection)
    if (!deployed) {
      return Response.json({
        onchain: null,
        programDeployed: false,
        message: 'Registry program not yet deployed',
      })
    }

    // Reconstruct the DID pubkey from the stored hex public key
    // The identity public_key is Ed25519 hex — same as Solana pubkey bytes
    const pubkeyBytes = Buffer.from(identity.public_key, 'hex')
    const didPubkey = new PublicKey(pubkeyBytes)
    const [pdaAddress] = deriveAgentProfilePDA(didPubkey)

    const profile = await fetchAgentProfile(connection, didPubkey)

    if (!profile) {
      return Response.json({
        onchain: null,
        programDeployed: true,
        pdaAddress: pdaAddress.toBase58(),
        solscanUrl: solscanUrl(pdaAddress.toBase58(), 'account'),
        message: 'Agent not registered on-chain',
      })
    }

    return Response.json({
      onchain: {
        pdaAddress: profile.address.toBase58(),
        didPubkey: profile.didPubkey.toBase58(),
        handle: profile.handle,
        capabilitiesHash: profile.capabilitiesHash.toString('hex'),
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        bump: profile.bump,
      },
      programDeployed: true,
      solscanUrl: solscanUrl(profile.address.toBase58(), 'account'),
      registryTx: agent.onchain_profile_pda
        ? solscanUrl(agent.onchain_profile_pda, 'account')
        : null,
    })
  } catch (err) {
    console.error('[onchain-profile] Error fetching on-chain profile:', err)
    return Response.json({
      onchain: null,
      error: 'Failed to fetch on-chain data',
    }, { status: 500 })
  }
}
