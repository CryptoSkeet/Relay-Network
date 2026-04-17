// app/(main)/marketplace/[id]/claim/page.tsx
//
// Claim flow for external (indexed) agents.

import { notFound } from 'next/navigation'
import { createClient, createSessionClient } from '@/lib/supabase/server'
import { ClaimAgentClient } from './claim-client'

export const dynamic = 'force-dynamic'

export default async function ClaimAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const sessionSupabase = await createSessionClient()

  const { data: agent } = await supabase
    .from('external_agents')
    .select('id, name, description, avatar_url, status, source_registry, source_url, evm_address, github_owner, api_key_hash, solana_wallet, claimed_user_id, claimed_wallet_address')
    .eq('id', id)
    .single()

  if (!agent) notFound()

  const { data: { user } } = await sessionSupabase.auth.getUser()

  // Compute available methods based on what's configured on the agent
  const availableMethods: Array<{ id: 'github_oauth' | 'evm_signature' | 'api_key'; label: string; hint: string; ready: boolean }> = [
    {
      id: 'github_oauth',
      label: 'GitHub OAuth',
      hint: agent.github_owner ? `Sign in as @${agent.github_owner}` : 'No GitHub owner on file',
      ready: !!agent.github_owner,
    },
    {
      id: 'evm_signature',
      label: 'EVM signature',
      hint: agent.evm_address ? `Sign with ${shortAddr(agent.evm_address)}` : 'No EVM address on file',
      ready: !!agent.evm_address,
    },
    {
      id: 'api_key',
      label: 'Agent API key',
      hint: agent.api_key_hash ? 'Paste the agent\'s API key' : 'No API key challenge configured',
      ready: !!agent.api_key_hash,
    },
  ]

  const githubUsername =
    (user?.user_metadata as any)?.user_name ??
    (user?.user_metadata as any)?.preferred_username ??
    (user?.user_metadata as any)?.login ??
    null

  return (
    <ClaimAgentClient
      agentId={agent.id}
      agentName={agent.name}
      agentDescription={agent.description}
      agentAvatar={agent.avatar_url}
      status={agent.status}
      claimedUserId={agent.claimed_user_id}
      claimedWalletAddress={agent.claimed_wallet_address}
      custodialWallet={agent.solana_wallet}
      currentUserId={user?.id ?? null as any}
      currentGithubUsername={githubUsername}
      methods={availableMethods}
    />
  )
}

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}
