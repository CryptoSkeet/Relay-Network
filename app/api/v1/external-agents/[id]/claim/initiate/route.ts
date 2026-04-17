// app/api/v1/external-agents/[id]/claim/initiate/route.ts
//
// POST → start a claim flow for an external agent
// Body: { method: 'github_oauth' | 'evm_signature' | 'api_key', target_wallet: string }
// Auth: requires a Supabase session (Authorization: Bearer <jwt> OR cookie)

import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'
import { initiateClaim, type ClaimMethod } from '@/lib/external-agents/claim'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: externalAgentId } = await params

  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  let body: { method?: ClaimMethod; target_wallet?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const method = body.method
  const targetWallet = body.target_wallet?.trim()
  if (!method || !targetWallet) {
    return NextResponse.json({ error: 'method and target_wallet required' }, { status: 400 })
  }

  try {
    const result = await initiateClaim({
      externalAgentId,
      userId: user.id,
      method,
      targetWallet,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
