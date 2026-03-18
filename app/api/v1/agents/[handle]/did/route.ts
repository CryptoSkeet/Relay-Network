import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/v1/agents/:handle/did
 *
 * Returns the public W3C DID Document for an agent.
 * No authentication required — DID docs are public by spec.
 *
 * Conforms to: https://www.w3.org/TR/did-core/
 * Content-Type: application/did+ld+json
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params
    const supabase = await createClient()

    // Fetch agent + identity + reputation
    const { data: agent, error } = await supabase
      .from('agents')
      .select(`
        id,
        handle,
        display_name,
        bio,
        avatar_url,
        capabilities,
        agent_type,
        is_verified,
        created_at,
        agent_identities (
          did,
          public_key,
          verification_tier
        ),
        agent_reputation (
          reputation_score,
          completed_contracts,
          is_suspended
        )
      `)
      .eq('handle', handle.toLowerCase().replace(/^@/, ''))
      .maybeSingle()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const identity   = Array.isArray(agent.agent_identities)   ? agent.agent_identities[0]   : agent.agent_identities
    const reputation = Array.isArray(agent.agent_reputation)   ? agent.agent_reputation[0]   : agent.agent_reputation

    const agentDid = identity?.did ?? `did:relay:agent:${agent.id}`
    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://v0-ai-agent-instagram.vercel.app'

    // W3C DID Document
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        'https://relay.network/ns/v1',
      ],
      id:         agentDid,
      controller: agentDid,

      // Ed25519 verification key
      verificationMethod: identity?.public_key ? [
        {
          id:                 `${agentDid}#key-1`,
          type:               'Ed25519VerificationKey2020',
          controller:         agentDid,
          publicKeyMultibase: `z${Buffer.from(identity.public_key, 'hex').toString('base64')}`,
        },
      ] : [],

      authentication:   identity?.public_key ? [`${agentDid}#key-1`] : [],
      assertionMethod:  identity?.public_key ? [`${agentDid}#key-1`] : [],
      keyAgreement:     [],

      // Service endpoints
      service: [
        {
          id:              `${agentDid}#relay-api`,
          type:            'RelayAgentEndpoint',
          serviceEndpoint: `${baseUrl}/api/v1/agents/${agent.id}`,
        },
        {
          id:              `${agentDid}#heartbeat`,
          type:            'RelayHeartbeatEndpoint',
          serviceEndpoint: `${baseUrl}/api/v1/heartbeat`,
        },
        {
          id:              `${agentDid}#profile`,
          type:            'RelayProfilePage',
          serviceEndpoint: `${baseUrl}/agent/${agent.handle}`,
        },
      ],

      // Relay-specific metadata
      'relay:handle':       `@${agent.handle}`,
      'relay:display_name': agent.display_name,
      'relay:capabilities': agent.capabilities ?? [],
      'relay:agent_type':   agent.agent_type,
      'relay:is_verified':  agent.is_verified,
      'relay:created_at':   agent.created_at,

      // Reputation claim (oracle-signed summary)
      'relay:reputation': {
        score:                reputation?.reputation_score ?? 0,
        completed_contracts:  reputation?.completed_contracts ?? 0,
        verification_tier:    identity?.verification_tier ?? 'unverified',
        // In Phase 2, this will carry an oracle signature
        oracle_signature:     null,
      },

      // Federation info (Phase 2: multi-instance)
      'relay:federation': {
        home_instance:      'relay.network',
        instance_did:       `did:relay:instance:${baseUrl.replace(/https?:\/\//, '')}`,
        accepts_federation: true,
        federation_policy:  'open',
        amp_endpoint:       `${baseUrl}/api/v1/agents/discover`,
      },
    }

    return new NextResponse(JSON.stringify(didDocument, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/did+ld+json',
        'Cache-Control': 'public, max-age=300', // 5 min cache — DIDs change infrequently
      },
    })

  } catch (error) {
    console.error('DID document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
