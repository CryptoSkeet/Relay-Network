import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/reputation-decay
 *
 * Whitepaper §4.3 — Temporal decay of reputation scores.
 *
 * Formula: R_new = R_old * decay_factor
 * where decay_factor = e^(-λ·Δt)
 *   λ = 0.01 (slow decay — approximately -1%/week)
 *   Δt = days since last_activity_at
 *
 * Applied only to agents inactive for > 7 days.
 * Suspended agents are skipped.
 * Minimum reputation floor: 100 (agents never hit 0 from inactivity alone).
 *
 * Runs daily at 02:00 UTC.
 */

const DECAY_LAMBDA   = 0.01   // daily decay rate
const INACTIVE_DAYS  = 7      // grace period before decay kicks in
const REPUTATION_FLOOR = 100  // minimum score from decay alone

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Block unauthenticated access in production
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const supabase = await createClient()
    const now = new Date()

    // Fetch all non-suspended agents with their last activity timestamps
    const { data: reputations, error } = await supabase
      .from('agent_reputation')
      .select('agent_id, reputation_score, last_activity_at')
      .eq('is_suspended', false)
      .lt('reputation_score', 1000)  // skip perfect scores (likely seeds/oracles)

    if (error) {
      console.error('Reputation decay: fetch error', error)
      return NextResponse.json({ error: 'Failed to fetch reputations' }, { status: 500 })
    }

    let decayed = 0
    let skipped = 0
    const updates: Array<{ agent_id: string; old_score: number; new_score: number }> = []

    for (const rep of reputations ?? []) {
      const lastActivity = rep.last_activity_at ? new Date(rep.last_activity_at) : null

      if (!lastActivity) {
        skipped++
        continue
      }

      const daysSinceActive = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceActive <= INACTIVE_DAYS) {
        skipped++
        continue
      }

      // Apply exponential decay: R_new = R_old * e^(-λ·Δt)
      const decayFactor = Math.exp(-DECAY_LAMBDA * daysSinceActive)
      const newScore = Math.max(REPUTATION_FLOOR, Math.round(rep.reputation_score * decayFactor))

      if (newScore === rep.reputation_score) {
        skipped++
        continue
      }

      updates.push({ agent_id: rep.agent_id, old_score: rep.reputation_score, new_score: newScore })
      decayed++
    }

    // Batch update in groups of 50
    const BATCH_SIZE = 50
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(u =>
          supabase
            .from('agent_reputation')
            .update({ reputation_score: u.new_score })
            .eq('agent_id', u.agent_id)
        )
      )
    }

    console.log(`[reputation-decay] Decayed: ${decayed}, Skipped: ${skipped}`)

    return NextResponse.json({
      success: true,
      decayed,
      skipped,
      total: (reputations ?? []).length,
      run_at: now.toISOString(),
    })

  } catch (err) {
    console.error('Reputation decay cron error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
