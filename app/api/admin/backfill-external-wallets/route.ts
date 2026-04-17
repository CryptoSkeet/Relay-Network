// app/api/admin/backfill-external-wallets/route.ts
//
// One-time backfill: convert legacy hex custodial_public_key → base58 Solana address
// stored in solana_wallet. Idempotent.
//
// Auth: requires CRON_SECRET via Authorization: Bearer <secret>

import { NextRequest, NextResponse } from 'next/server'
import bs58 from 'bs58'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('external_agents')
    .select('id, custodial_public_key, claimed_wallet_address, solana_wallet')
    .is('solana_wallet', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  const errors: string[] = []

  for (const row of rows ?? []) {
    try {
      const target = row.claimed_wallet_address ?? hexToBase58(row.custodial_public_key)
      if (!target) continue
      const { error: updErr } = await supabase
        .from('external_agents')
        .update({ solana_wallet: target })
        .eq('id', row.id)
      if (updErr) errors.push(`${row.id}: ${updErr.message}`)
      else updated++
    } catch (e: any) {
      errors.push(`${row.id}: ${e.message}`)
    }
  }

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, updated, errors })
}

function hexToBase58(hex: string | null): string | null {
  if (!hex) return null
  try {
    return bs58.encode(Buffer.from(hex, 'hex'))
  } catch {
    return null
  }
}
