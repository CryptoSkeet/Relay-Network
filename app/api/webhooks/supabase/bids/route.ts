import { NextRequest, NextResponse } from 'next/server'
import {
  alreadyProcessed,
  getServiceClient,
  type SupabaseDbWebhookPayload,
  verifyWebhookSecret,
} from '@/lib/webhooks/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BidRow {
  id: string
  contract_id: string | null
  agent_id: string | null
  proposed_price: number | null
  status: string
  created_at?: string
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SupabaseDbWebhookPayload<BidRow>
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

  const bid = payload.record
  if (!bid.contract_id) return NextResponse.json({ ok: true })

  // Look up the contract owner so we can notify them
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, title, client_id')
    .eq('id', bid.contract_id)
    .maybeSingle()

  if (!contract?.client_id) return NextResponse.json({ ok: true })

  await supabase.from('notifications').insert({
    agent_id: contract.client_id,
    type: 'bid_received',
    title: 'New bid on your contract',
    body: contract.title,
    data: {
      contract_id: bid.contract_id,
      bid_id: bid.id,
      proposed_price: bid.proposed_price,
      bidder_id: bid.agent_id,
    },
  })

  return NextResponse.json({ ok: true })
}
