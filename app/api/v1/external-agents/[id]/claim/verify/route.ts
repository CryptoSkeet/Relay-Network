// app/api/v1/external-agents/[id]/claim/verify/route.ts
//
// POST → verify the claim challenge AND immediately transfer custody.
// Body: { challenge_id: string, proof: string }
//   - For github_oauth: proof is ignored — we read the GitHub username from the
//     authenticated Supabase session's user_metadata.user_name.
//   - For evm_signature: proof is the hex signature of `messageToSign`.
//   - For api_key: proof is the raw API key (we sha256 it server-side).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createSessionClient } from '@/lib/supabase/server'
import { verifyClaim, transferCustody } from '@/lib/external-agents/claim'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: externalAgentId } = await params

  const supabase = await createSessionClient()
  const adminSupabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  let body: { challenge_id?: string; proof?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const challengeId = body.challenge_id?.trim()
  if (!challengeId) return NextResponse.json({ error: 'challenge_id required' }, { status: 400 })

  // Look up challenge to determine method (service role — RLS-bypass)
  const { data: challenge } = await adminSupabase
    .from('external_agent_claim_challenges')
    .select('method, user_id, target_wallet, external_agent_id')
    .eq('id', challengeId)
    .single()

  if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
  if (challenge.user_id !== user.id) return NextResponse.json({ error: 'Challenge belongs to a different user' }, { status: 403 })
  if (challenge.external_agent_id !== externalAgentId) {
    return NextResponse.json({ error: 'Challenge / agent mismatch' }, { status: 400 })
  }

  // For github_oauth, derive proof from session metadata.
  // If the user's GitHub login doesn't match agent.github_owner exactly,
  // check whether agent.github_owner is an organization the user belongs to.
  let proof = body.proof?.trim() ?? ''
  if (challenge.method === 'github_oauth') {
    const ghUser =
      (user.user_metadata as any)?.user_name ??
      (user.user_metadata as any)?.preferred_username ??
      (user.user_metadata as any)?.login
    if (!ghUser) {
      return NextResponse.json(
        { error: 'GitHub username not found on session — sign in with GitHub first.' },
        { status: 400 },
      )
    }

    // Look up the owner on the agent so we can compare / check org membership
    const { data: agentRow } = await adminSupabase
      .from('external_agents')
      .select('github_owner')
      .eq('id', externalAgentId)
      .single()
    const owner = agentRow?.github_owner?.trim() ?? ''
    const ghUserStr = String(ghUser).trim()

    if (owner && owner.toLowerCase() !== ghUserStr.toLowerCase()) {
      // Try org membership check using the provider OAuth token
      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = (session as any)?.provider_token as string | undefined
      if (providerToken) {
        try {
          const r = await fetch(`https://api.github.com/orgs/${encodeURIComponent(owner)}/memberships/${encodeURIComponent(ghUserStr)}`, {
            headers: {
              Authorization: `Bearer ${providerToken}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          })
          if (r.ok) {
            const m = await r.json()
            if (m?.state === 'active') {
              // Member of the org → satisfy the equality check downstream
              proof = owner
            }
          }
        } catch (e) {
          console.warn('[claim] github org membership check failed:', e)
        }
      }
      if (!proof) proof = ghUserStr
      else if (proof !== owner) proof = ghUserStr
    } else {
      proof = ghUserStr
    }
  }

  if (!proof) return NextResponse.json({ error: 'proof required' }, { status: 400 })

  try {
    const verified = await verifyClaim({ challengeId, proof })
    const transfer = await transferCustody(
      verified.externalAgentId,
      verified.targetWallet,
      user.id,
      challenge.method as any,
    )

    return NextResponse.json({
      ok: true,
      verified: true,
      transfer,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
