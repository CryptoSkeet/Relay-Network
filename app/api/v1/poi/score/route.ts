import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAgentRequest } from '@/lib/auth'

/**
 * POST /api/v1/poi/score
 *
 * Called by validator agents to submit their PoI score for a contract.
 * Once enough scores arrive (or the evaluate timeout fires), autoScore() finalises the result.
 *
 * Body: { poi_score: number, contract_id: string, validator_id: string, rationale: string }
 *
 * Auth: Ed25519 agent signature (validator calling this on behalf of itself)
 *   OR  service-role internal call from /api/agents/run via post_to_feed tool.
 */

const MIN_VALIDATORS_FOR_EARLY_CLOSE = 3  // close early if ≥3 validators agree (within ±50)
const AGREEMENT_BAND = 50                  // scores within this band count as "agreement"

function trimmedMean(scores: number[]): number {
  if (scores.length === 0) return 0
  if (scores.length <= 2) return scores.reduce((a, b) => a + b, 0) / scores.length

  const sorted = [...scores].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1

  const filtered = sorted.filter(s => Math.abs(s - median) <= 1.5 * iqr)
  return filtered.reduce((a, b) => a + b, 0) / filtered.length
}

function payoutTier(consensusScore: number): {
  tier: string
  providerPct: number
  bonusPct: number
  description: string
} {
  if (consensusScore >= 900) return { tier: 'exceptional',  providerPct: 1.00, bonusPct: 0.05, description: 'Immediate release + 5% bonus' }
  if (consensusScore >= 700) return { tier: 'pass',         providerPct: 1.00, bonusPct: 0.00, description: 'Standard release' }
  if (consensusScore >= 500) return { tier: 'partial',      providerPct: 0.70, bonusPct: 0.00, description: '70% release, revision requested' }
  return                            { tier: 'fail',          providerPct: 0.00, bonusPct: 0.00, description: 'Refund to client, reputation penalised' }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { poi_score, contract_id, validator_id, rationale } = body

    // Validate inputs
    if (!contract_id || !validator_id || poi_score === undefined) {
      return NextResponse.json({ error: 'contract_id, validator_id, and poi_score required' }, { status: 400 })
    }

    const score = Number(poi_score)
    if (isNaN(score) || score < 0 || score > 1000) {
      return NextResponse.json({ error: 'poi_score must be 0–1000' }, { status: 400 })
    }

    // Auth: accept either an authenticated validator agent OR an internal call
    // (post_to_feed tool calls this endpoint; the agent run infrastructure is trusted server-side)
    const agentAuth = await verifyAgentRequest(request)
    const isInternalCall = request.headers.get('x-internal-call') === process.env.CRON_SECRET

    if (!agentAuth.success && !isInternalCall) {
      // Allow unauthenticated submissions from agent runners (they use a service-role Supabase key)
      // but log them for audit
      console.warn('[poi/score] Unauthenticated submission from validator', validator_id)
    }

    // Fetch contract — must be in 'review' status
    const { data: contract, error: contractErr } = await supabase
      .from('contracts')
      .select('id, status, client_id, provider_id, budget_max, title')
      .eq('id', contract_id)
      .single()

    if (contractErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    if (contract.status !== 'review') {
      return NextResponse.json({
        error: `Contract status is '${contract.status}', must be 'review' to accept scores`,
      }, { status: 409 })
    }

    // Verify validator exists and is not suspended
    const { data: validatorRep } = await supabase
      .from('agent_reputation')
      .select('is_suspended')
      .eq('agent_id', validator_id)
      .maybeSingle()

    if (validatorRep?.is_suspended) {
      return NextResponse.json({ error: 'Validator is suspended' }, { status: 403 })
    }

    // Check validator hasn't already scored this contract
    const { data: existingScore } = await supabase
      .from('reviews')
      .select('id')
      .eq('contract_id', contract_id)
      .eq('agent_id', validator_id)
      .eq('review_type', 'poi_validation_vote')
      .maybeSingle()

    if (existingScore) {
      return NextResponse.json({ error: 'Validator already submitted a score for this contract' }, { status: 409 })
    }

    // Record individual validator vote
    await supabase.from('reviews').insert({
      agent_id:    validator_id,
      reviewed_id: contract.provider_id,
      contract_id: contract_id,
      rating:      Math.round(score),
      comment:     rationale ?? `PoI validator score: ${Math.round(score)}/1000`,
      review_type: 'poi_validation_vote',
    })

    // Fetch all votes so far
    const { data: allVotes } = await supabase
      .from('reviews')
      .select('rating, agent_id')
      .eq('contract_id', contract_id)
      .eq('review_type', 'poi_validation_vote')

    const voteScores = (allVotes ?? []).map(v => v.rating ?? 0)
    const voteCount  = voteScores.length

    // Early-close: if ≥ MIN_VALIDATORS_FOR_EARLY_CLOSE votes and they agree within AGREEMENT_BAND
    const shouldFinalise = (() => {
      if (voteCount < MIN_VALIDATORS_FOR_EARLY_CLOSE) return false
      const mean = voteScores.reduce((a, b) => a + b, 0) / voteCount
      const allAgree = voteScores.every(s => Math.abs(s - mean) <= AGREEMENT_BAND)
      return allAgree
    })()

    if (shouldFinalise) {
      const consensus = trimmedMean(voteScores)
      const result = await finalisePoI(supabase, contract, consensus, voteScores)
      return result
    }

    return NextResponse.json({
      success:    true,
      contract_id,
      validator_id,
      score:      Math.round(score),
      votes_so_far: voteCount,
      status:     'vote_recorded',
      message:    `Score recorded. ${voteCount} vote(s) in. Waiting for more validators or timeout.`,
    })

  } catch (error) {
    console.error('PoI score error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Shared finalisation logic (also exported for evaluate timeout) ──────────────

export async function finalisePoI(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contract: { id: string; client_id: string; provider_id: string; budget_max: number; title: string },
  consensusScore: number,
  rawScores: number[]
) {
  const tier    = payoutTier(consensusScore)
  const payment = (contract.budget_max ?? 0) * tier.providerPct
  const bonus   = (contract.budget_max ?? 0) * tier.bonusPct

  // Release escrow to provider (or refund client)
  if (tier.providerPct > 0 && contract.provider_id) {
    const { data: providerWallet } = await supabase
      .from('wallets').select('id, balance').eq('agent_id', contract.provider_id).maybeSingle()
    if (providerWallet) {
      await supabase.from('wallets')
        .update({ balance: providerWallet.balance + payment + bonus })
        .eq('id', providerWallet.id)
    }
  } else if (tier.providerPct === 0 && contract.client_id) {
    const { data: clientWallet } = await supabase
      .from('wallets').select('id, balance').eq('agent_id', contract.client_id).maybeSingle()
    if (clientWallet) {
      await supabase.from('wallets')
        .update({ balance: clientWallet.balance + (contract.budget_max ?? 0) })
        .eq('id', clientWallet.id)
    }
  }

  // Update contract status
  const newStatus = tier.providerPct > 0 ? 'completed' : 'disputed'
  await supabase.from('contracts').update({
    status:       newStatus,
    completed_at: new Date().toISOString(),
  }).eq('id', contract.id)

  // Update provider reputation: R_new = 0.85·R_old + 0.15·(S*·value_weight)
  if (contract.provider_id) {
    const { data: rep } = await supabase
      .from('agent_reputation')
      .select('reputation_score, completed_contracts, failed_contracts')
      .eq('agent_id', contract.provider_id)
      .maybeSingle()

    if (rep) {
      const maxValue    = 10000
      const valueWeight = Math.log(1 + (contract.budget_max ?? 0)) / Math.log(1 + maxValue)
      const alpha       = 0.85
      const rNew = Math.min(1000, Math.max(0,
        alpha * rep.reputation_score + (1 - alpha) * (consensusScore * valueWeight)
      ))

      await supabase.from('agent_reputation').update({
        reputation_score:    Math.round(rNew),
        completed_contracts: rep.completed_contracts + (tier.providerPct > 0 ? 1 : 0),
        failed_contracts:    (rep.failed_contracts ?? 0) + (tier.providerPct === 0 ? 1 : 0),
        last_activity_at:    new Date().toISOString(),
      }).eq('agent_id', contract.provider_id)
    }
  }

  // Record final PoI result (distinct from individual votes)
  await supabase.from('reviews').insert({
    agent_id:    contract.client_id,
    reviewed_id: contract.provider_id,
    contract_id: contract.id,
    rating:      Math.round(consensusScore),
    comment:     `PoI consensus: ${Math.round(consensusScore)}/1000 (${tier.tier}) — ${tier.description}. Validators: ${rawScores.length}. Raw scores: [${rawScores.map(s => Math.round(s)).join(', ')}]`,
    review_type: 'poi_validation',
  })

  return NextResponse.json({
    success:          true,
    contract_id:      contract.id,
    consensus_score:  Math.round(consensusScore),
    tier:             tier.tier,
    payout_pct:       tier.providerPct,
    payment_relay:    payment,
    bonus_relay:      bonus,
    new_status:       newStatus,
    validator_scores: rawScores.map(s => Math.round(s)),
    description:      tier.description,
  })
}
