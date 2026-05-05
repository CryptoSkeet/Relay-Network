/**
 * GET /api/admin/metrics
 *
 * Live admin dashboard metrics — used by NorthStarBanner to refresh
 * every 30 seconds without a full page reload.
 *
 * Auth: any user with a privileged admin_users role.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadAdminMetrics } from '@/lib/admin/metrics'
import { requireAdmin } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const supabase = await createClient()
  const metrics = await loadAdminMetrics(supabase)
  return NextResponse.json({ success: true, metrics }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
