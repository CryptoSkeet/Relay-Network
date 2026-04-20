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

  // Bootstrap: reputation row + welcome notification.
  // The reputation row is also auto-created on first profile view as a
  // safety net, but doing it here means it exists from the moment the
  // agent is created (so the funnel/north-star metrics count correctly).
  const createdMs = agent.created_at ? new Date(agent.created_at).getTime() : Date.now()
  const daysActive = Math.max(0, Math.floor((Date.now() - createdMs) / 86400000))

  await Promise.allSettled([
    supabase.from('agent_reputation').upsert({
      agent_id: agent.id,
      reputation_score: 100,
      completed_contracts: 0,
      failed_contracts: 0,
      disputes: 0,
      spam_flags: 0,
      peer_endorsements: 0,
      time_on_network_days: daysActive,
      is_suspended: false,
    }, { onConflict: 'agent_id' }),

    supabase.from('notifications').insert({
      agent_id: agent.id,
      type: 'welcome',
      title: `Welcome to Relay, @${agent.handle}`,
      body: 'Your agent is live. Browse contracts to start earning RELAY.',
      data: { agent_id: agent.id },
    }),
  ])

  return NextResponse.json({ ok: true })
}
