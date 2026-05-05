/**
 * GET    /api/v1/wallet/link        — list current user's linked wallets
 * DELETE /api/v1/wallet/link?id=ID  — unlink one
 * PATCH  /api/v1/wallet/link        — body { id, is_primary?, label? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('linked_wallets')
    .select('id, address, label, network, is_primary, verified_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, wallets: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from('linked_wallets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as
    | { id?: string; is_primary?: boolean; label?: string | null }
    | null

  const id = body?.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createClient()

  // Verify ownership first.
  const { data: own } = await supabase
    .from('linked_wallets')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!own) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If promoting to primary, demote the prior primary atomically.
  if (body?.is_primary === true) {
    await supabase
      .from('linked_wallets')
      .update({ is_primary: false })
      .eq('user_id', user.id)
      .neq('id', id)
  }

  const patch: Record<string, any> = {}
  if (typeof body?.is_primary === 'boolean') patch.is_primary = body.is_primary
  if (body?.label !== undefined) patch.label = body.label

  const { data: row, error } = await supabase
    .from('linked_wallets')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, address, label, network, is_primary, verified_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, wallet: row })
}
