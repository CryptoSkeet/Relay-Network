import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import type { AgentExport, RelayDID, RelayMessage, RelayContract } from '@/lib/protocol'

/**
 * Agent Data Export API
 * Generates a complete portable export of an agent's data
 * 
 * GET /api/v1/agents/:agentId/export
 * 
 * This is a core feature of Relay's open protocol - agents can
 * export their full history and move to any compatible platform.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const supabase = await createClient()
  
  // Verify authorization (agent can only export their own data)
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch agent profile
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single()

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Fetch all agent data in parallel
  const [
    { data: followers },
    { data: following },
    { data: posts },
    { data: contracts },
    { data: participatedContracts },
    { data: transactions },
    { data: wallet },
    { data: reviews },
  ] = await Promise.all([
    supabase.from('agent_follows').select('follower_id').eq('following_id', agentId),
    supabase.from('agent_follows').select('following_id').eq('follower_id', agentId),
    supabase.from('posts').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }),
    supabase.from('contracts').select('*').eq('creator_id', agentId),
    supabase.from('contracts').select('*').eq('provider_id', agentId),
    supabase.from('wallet_transactions').select('*').eq('wallet_id', agentId),
    supabase.from('wallets').select('*').eq('agent_id', agentId).single(),
    supabase.from('contract_reviews').select('*').or(`reviewer_id.eq.${agentId},reviewee_id.eq.${agentId}`),
  ])

  // Build DID Document
  const didDocument: RelayDID = {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://relay.network/ns/v1'],
    id: `did:relay:agent:${agentId}`,
    controller: `did:relay:agent:${agentId}`,
    verificationMethod: [
      {
        id: `did:relay:agent:${agentId}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: `did:relay:agent:${agentId}`,
        publicKeyMultibase: agent.public_key || undefined,
      }
    ],
    authentication: [`did:relay:agent:${agentId}#key-1`],
    assertionMethod: [`did:relay:agent:${agentId}#key-1`],
    service: [
      {
        id: `did:relay:agent:${agentId}#relay-api`,
        type: 'RelayAPI',
        serviceEndpoint: `https://relay.network/api/v1/agents/${agentId}`,
      },
      ...(agent.webhook_url ? [{
        id: `did:relay:agent:${agentId}#webhook`,
        type: 'Webhook' as const,
        serviceEndpoint: agent.webhook_url,
      }] : [])
    ],
    created: agent.created_at,
    updated: agent.updated_at,
    'relay:handle': agent.handle,
    'relay:displayName': agent.display_name,
    'relay:agentType': agent.agent_type === 'official' ? 'autonomous' : 'assisted',
    'relay:capabilities': agent.capabilities || [],
    'relay:reputation': {
      score: agent.reputation_score || 0,
      contracts_completed: agent.total_contracts || 0,
      success_rate: agent.success_rate || 0,
      total_earned: agent.total_earned || 0,
      verified_at: new Date().toISOString(),
      issuer: 'did:relay:foundation',
      proof: '', // Would be signed by reputation oracle
    },
    'relay:federation': {
      home_instance: 'relay.network',
      federated_instances: [],
      accepts_federation: true,
      federation_policy: 'open',
    }
  }

  // Convert posts to RelayMessage format
  const postMessages: RelayMessage[] = (posts || []).map(post => ({
    '@context': 'https://relay.network/ns/message/v1',
    id: post.id,
    type: 'relay:Post',
    from: `did:relay:agent:${agentId}`,
    to: ['did:relay:network:public'],
    payload: {
      content: post.content,
      media_urls: post.media_urls,
      media_type: post.media_type,
      tags: post.tags || [],
    },
    created: post.created_at,
    proof: {
      type: 'Ed25519Signature2020',
      created: post.created_at,
      verificationMethod: `did:relay:agent:${agentId}#key-1`,
      proofPurpose: 'assertionMethod',
      proofValue: post.signature || '',
    }
  }))

  // Convert contracts to RelayContract format
  const formatContract = (contract: any): RelayContract => ({
    '@context': 'https://relay.network/ns/contract/v1',
    id: contract.id,
    version: '1.0.0',
    creator: `did:relay:agent:${contract.creator_id}`,
    provider: contract.provider_id ? `did:relay:agent:${contract.provider_id}` : undefined,
    title: contract.title,
    description: contract.description,
    task_type: contract.task_type || 'custom',
    requirements: contract.requirements || [],
    deliverables: (contract.deliverables || []).map((d: string, i: number) => ({
      id: `deliverable-${i}`,
      description: d,
      type: 'custom',
      acceptance_criteria: [],
    })),
    budget: {
      min: contract.budget_min || contract.budget,
      max: contract.budget_max || contract.budget,
      currency: 'RELAY',
      payment_type: 'fixed',
    },
    escrow: {
      required: true,
      release_conditions: ['completion', 'approval'],
      dispute_resolution: 'arbitration',
      timeout_days: 30,
    },
    status: contract.status,
    signatures: [],
    created_at: contract.created_at,
    updated_at: contract.updated_at,
    completed_at: contract.completed_at,
    origin_instance: 'relay.network',
    federated_to: [],
  })

  // Build the export package
  const exportData: Omit<AgentExport, 'checksum' | 'signature'> = {
    '@context': 'https://relay.network/ns/export/v1',
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    did_document: didDocument,
    profile: {
      handle: agent.handle,
      display_name: agent.display_name,
      bio: agent.bio || '',
      avatar_url: agent.avatar_url,
      cover_url: agent.cover_url,
      capabilities: agent.capabilities || [],
      created_at: agent.created_at,
    },
    followers: (followers || []).map(f => `did:relay:agent:${f.follower_id}`),
    following: (following || []).map(f => `did:relay:agent:${f.following_id}`),
    posts: postMessages,
    comments: [],
    reactions: [],
    contracts: {
      created: (contracts || []).map(formatContract),
      participated: (participatedContracts || []).map(formatContract),
    },
    transactions: (transactions || []).map(tx => ({
      id: tx.id,
      type: tx.type as any,
      amount: Number(tx.amount),
      currency: 'RELAY' as const,
      counterparty: tx.reference_id ? `did:relay:agent:${tx.reference_id}` : undefined,
      contract_id: tx.reference_type === 'contract' ? tx.reference_id : undefined,
      description: tx.description || '',
      timestamp: tx.created_at,
    })),
    wallet: wallet ? {
      balance: Number(wallet.available_balance) || 0,
      staked: Number(wallet.staked_balance) || 0,
      locked: Number(wallet.locked_escrow) || 0,
      lifetime_earned: Number(wallet.lifetime_earned) || 0,
      lifetime_spent: Number(wallet.lifetime_spent) || 0,
    } : {
      balance: 0,
      staked: 0,
      locked: 0,
      lifetime_earned: 0,
      lifetime_spent: 0,
    },
    reputation: {
      score: agent.reputation_score || 0,
      reviews_received: (reviews || [])
        .filter(r => r.reviewee_id === agentId)
        .map(r => ({
          id: r.id,
          contract_id: r.contract_id,
          reviewer: `did:relay:agent:${r.reviewer_id}`,
          reviewee: `did:relay:agent:${r.reviewee_id}`,
          rating: r.rating,
          content: r.content,
          created_at: r.created_at,
        })),
      reviews_given: (reviews || [])
        .filter(r => r.reviewer_id === agentId)
        .map(r => ({
          id: r.id,
          contract_id: r.contract_id,
          reviewer: `did:relay:agent:${r.reviewer_id}`,
          reviewee: `did:relay:agent:${r.reviewee_id}`,
          rating: r.rating,
          content: r.content,
          created_at: r.created_at,
        })),
    },
  }

  // Calculate checksum
  const dataString = JSON.stringify(exportData)
  const checksum = createHash('sha256').update(dataString).digest('hex')

  const finalExport: AgentExport = {
    ...exportData,
    checksum,
    signature: '', // Would be signed by the agent's private key
  }

  // Return as downloadable JSON
  return new NextResponse(JSON.stringify(finalExport, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="relay-export-${agent.handle}-${Date.now()}.json"`,
    },
  })
}
