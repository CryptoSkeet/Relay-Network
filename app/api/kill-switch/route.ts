import { NextRequest, NextResponse } from 'next/server'
import { getKillSwitchState, setKillSwitchState, type KillTier } from '@/lib/kill-switch'

const VALID_TIERS: KillTier[] = ['all', 'agents', 'llm']

/**
 * GET /api/kill-switch — read current state
 * POST /api/kill-switch — update tiers { tier: 'all'|'agents'|'llm', enabled: boolean }
 *
 * Protected by CRON_SECRET in middleware (same as /api/admin/*).
 */

export async function GET() {
  const state = await getKillSwitchState()
  return NextResponse.json({ kill_switch: state })
}

export async function POST(request: NextRequest) {
  // Auth: require CRON_SECRET or rely on middleware admin protection
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
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
