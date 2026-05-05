/**
 * POST /api/admin/users/[id]/suspend
 *
 * Body: { action: 'suspend' | 'unsuspend' }
 *
 * Bans / unbans a Supabase auth user. Logs to admin_logs.
 * Auth: super-user only (4dirby@gmail.com).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUSPEND_DURATION = '876600h' // ~100 years
const UNSUSPEND_DURATION = 'none'  // Supabase: 'none' or '0' clears the ban

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin(request, { requireSuperUser: true })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

  const body = await request.json().catch(() => null) as { action?: string } | null
  const action = body?.action
  if (action !== 'suspend' && action !== 'unsuspend') {
    return NextResponse.json({ error: "Body must be { action: 'suspend' | 'unsuspend' }" }, { status: 400 })
  }

  const admin = createAdminClient()
  const banDuration = action === 'suspend' ? SUSPEND_DURATION : UNSUSPEND_DURATION

  const { data, error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: banDuration,
  } as any)
  if (error) {
    return NextResponse.json({ error: `updateUserById: ${error.message}` }, { status: 500 })
  }

  // Best-effort audit log; do not fail the request if logging fails
  try {
    await admin.from('admin_logs').insert({
      action: action === 'suspend' ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED',
      target_type: 'auth.users',
      target_id: id,
      details: { triggered_by: gate.user?.email ?? null, ban_duration: banDuration },
    })
  } catch { /* swallow */ }

  return NextResponse.json({
    success: true,
    user_id: id,
    action,
    banned_until: (data?.user as any)?.banned_until ?? null,
  })
}
