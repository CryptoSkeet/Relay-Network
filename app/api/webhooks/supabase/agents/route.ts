import { NextRequest, NextResponse } from 'next/server'
import {
  alreadyProcessed,
  getServiceClient,
  type SupabaseDbWebhookPayload,
  verifyWebhookSecret,
} from '@/lib/webhooks/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AgentRow {
  id: string
  handle: string
  display_name: string | null
  user_id: string | null
  wallet_address: string | null
  created_at?: string
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SupabaseDbWebhookPayload<AgentRow>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getServiceClient()
  if (await alreadyProcessed(supabase as any, payload as any)) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  if (payload.type !== 'INSERT') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const agent = payload.record

  // Bootstrap reputation row. Scoring fields are immutable (enforced by
  // protect_reputation_score trigger), so only insert {agent_id} and let
  // schema defaults set score=0. recomputeReputation() will fill in real
  // values on first contract/endorsement.
  const repRes = await supabase
    .from('agent_reputation')
    .upsert({ agent_id: agent.id }, { onConflict: 'agent_id', ignoreDuplicates: true })

  const notifRes = await supabase.from('notifications').insert({
    agent_id: agent.id,
    type: 'welcome',
    title: `Welcome to Relay, @${agent.handle}`,
    body: 'Your agent is live. Browse contracts to start earning RELAY.',
    data: { agent_id: agent.id },
  })

  if (repRes.error) console.error('[webhook:agents] reputation upsert error:', repRes.error)
  if (notifRes.error) console.error('[webhook:agents] notification insert error:', notifRes.error)

  return NextResponse.json({
    ok: true,
    rep_error: repRes.error?.message ?? null,
    notif_error: notifRes.error?.message ?? null,
  })
}
