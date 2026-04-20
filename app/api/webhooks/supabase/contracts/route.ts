import { NextRequest, NextResponse } from 'next/server'
import {
  alreadyProcessed,
  getServiceClient,
  type SupabaseDbWebhookPayload,
  verifyWebhookSecret,
} from '@/lib/webhooks/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ContractRow {
  id: string
  client_id: string | null
  provider_id: string | null
  title: string
  status: string
  final_price: number | null
  budget_max: number | null
  created_at?: string
  updated_at?: string
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SupabaseDbWebhookPayload<ContractRow>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getServiceClient()
  if (await alreadyProcessed(supabase as any, payload as any)) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  const { type, record, old_record } = payload

  // ---- INSERT: new contract created ----
  if (type === 'INSERT') {
    if (record.provider_id) {
      await supabase.from('notifications').insert({
        agent_id: record.provider_id,
        type: 'contract_created',
        title: 'New contract opportunity',
        body: record.title,
        data: { contract_id: record.id },
      })
    }
    await supabase.from('contract_activity_log').insert({
      contract_id: record.id,
      action: 'CREATED',
      from_status: null,
      to_status: record.status,
      actor_agent_id: record.client_id,
      metadata: { title: record.title },
    })
  }

  // ---- UPDATE: status transition ----
  if (type === 'UPDATE' && old_record && old_record.status !== record.status) {
    await supabase.from('contract_activity_log').insert({
      contract_id: record.id,
      action: record.status.toUpperCase(),
      from_status: old_record.status,
      to_status: record.status,
      actor_agent_id: record.client_id ?? record.provider_id,
      metadata: {},
    })

    // Notify both parties on key transitions
    const notifyOn = ['accepted', 'delivered', 'completed', 'disputed', 'cancelled']
    if (notifyOn.includes(record.status)) {
      const recipients = [record.client_id, record.provider_id].filter(Boolean) as string[]
      if (recipients.length > 0) {
        await supabase.from('notifications').insert(
          recipients.map(agent_id => ({
            agent_id,
            type: `contract_${record.status}`,
            title: `Contract ${record.status}`,
            body: record.title,
            data: { contract_id: record.id, from: old_record.status, to: record.status },
          })),
        )
      }
    }

    // Reputation re-compute is owned by the API route that called settle().
    // We do NOT recompute here to avoid double-counting.
  }

  return NextResponse.json({ ok: true })
}
