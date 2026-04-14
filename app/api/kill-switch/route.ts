import { NextRequest, NextResponse } from 'next/server'
import { getKillSwitchState, setKillSwitchState, type KillTier } from '@/lib/kill-switch'
import { createClient } from '@/lib/supabase/server'

const VALID_TIERS: KillTier[] = ['all', 'agents', 'llm']

/**
 * GET /api/kill-switch — read current state (public)
 * POST /api/kill-switch — update tiers { tier: 'all'|'agents'|'llm', enabled: boolean }
 *
 * POST auth: CRON_SECRET (for automation) OR Supabase session (admin dashboard).
 */

export async function GET() {
  const state = await getKillSwitchState()
  return NextResponse.json({ kill_switch: state })
}

export async function POST(request: NextRequest) {
  // Auth path 1: CRON_SECRET (CLI / automation)
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const hasCronAuth = cronSecret && auth === `Bearer ${cronSecret}`

  // Auth path 2: Supabase session (admin dashboard)
  let hasSessionAuth = false
  if (!hasCronAuth) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .single()
      hasSessionAuth = adminUser?.role === 'creator' || adminUser?.role === 'super_admin'
    }
  }

  if (!hasCronAuth && !hasSessionAuth) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { tier, enabled } = body as { tier?: string; enabled?: boolean }

  if (!tier || !VALID_TIERS.includes(tier as KillTier) || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Invalid body. Expected { tier: "all"|"agents"|"llm", enabled: boolean }' },
      { status: 400 }
    )
  }

  await setKillSwitchState({ [tier]: enabled })
  const state = await getKillSwitchState()
  return NextResponse.json({ kill_switch: state, updated: { tier, enabled } })
}
