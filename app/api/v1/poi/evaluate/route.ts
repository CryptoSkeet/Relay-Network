import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/v1/poi/evaluate
 *
 * Proof-of-Intelligence v1 — off-chain validator consensus.
 *
 * Triggered automatically when a contract is delivered.
 * Can also be called manually to re-evaluate a delivered contract.
 *
 * Flow:
 *   1. Select up to 5 validator agents (highest reputation, excluding client + provider)
 *   2. Fire each validator via /api/agents/run with a validation task
 *   3. Validators return a score 0–1000 via POST /api/v1/poi/score
 *   4. After timeout OR all scores received, compute trimmed mean (IQR filter)
 *   5. Apply payout tier, update reputation, record on reviews table
 *
 * Body: { contract_id: string }
 */

const VALIDATOR_COUNT  = 5
const POI_TIMEOUT_MS   = 120_000  // 2 minutes max for validators to score
const MIN_PASS_SCORE   = 700      // whitepaper threshold
const PARTIAL_SCORE    = 500      // partial release threshold

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
    const supabase  = await createClient()
    const body      = await request.json()
    const { contract_id } = body

    if (!contract_id) {
      return NextResponse.json({ error: 'contract_id required' }, { status: 400 })
    }

    // Fetch contract with deliverables
    const { data: contract, error: contractErr } = await supabase
      .from('contracts')
      .select('*, contract_deliverables(*)')
      .eq('id', contract_id)
      .single()

    if (contractErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    if (contract.status !== 'delivered') {
      return NextResponse.json({ error: `Contract status is '${contract.status}', must be 'delivered'` }, { status: 400 })
    }

    // Check if PoI already ran for this contract
    const { data: existingReviews } = await supabase
      .from('reviews')
      .select('id')
      .eq('contract_id', contract_id)
      .eq('review_type', 'poi_validation')
      .limit(1)

    if (existingReviews && existingReviews.length > 0) {
      return NextResponse.json({ error: 'PoI already evaluated for this contract' }, { status: 409 })
    }

    // Select validators: top-reputation agents, exclude client + provider
    const { data: validators } = await supabase
      .from('agents')
      .select('id, handle, capabilities')
      .not('id', 'in', `(${[contract.client_id, contract.provider_id].filter(Boolean).join(',')})`)
      .order('id')  // stable ordering; reputation join done below
      .limit(20)

    // Sort by reputation score via a separate query
    const validatorIds = (validators ?? []).map(v => v.id)
    const { data: repScores } = await supabase
      .from('agent_reputation')
      .select('agent_id, reputation_score')
      .in('agent_id', validatorIds)
      .eq('is_suspended', false)
      .order('reputation_score', { ascending: false })
      .limit(VALIDATOR_COUNT)

    const topValidators = (repScores ?? []).slice(0, VALIDATOR_COUNT)

    if (topValidators.length === 0) {
      // No validators available — auto-score at minimum pass threshold
      return await autoScore(supabase, contract, 750, [])
    }

    // Build deliverable summary for validators
    const deliverablesSummary = (contract.contract_deliverables ?? [])
      .map((d: { title: string; description: string; proof_links?: string[]; status: string }) =>
        `- ${d.title}: ${d.description} | Status: ${d.status} | Proofs: ${(d.proof_links ?? []).join(', ') || 'none'}`
      ).join('\n')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://relaynetwork.ai'

    // Fire validators (fire-and-forget — scores collected via /api/v1/poi/score)
    // Mark contract as 'review' while validators deliberate
    await supabase.from('contracts').update({ status: 'review' }).eq('id', contract_id)

    for (const validator of topValidators) {
      fetch(`${baseUrl}/api/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:  validator.agent_id,
          task: `You are a PoI (Proof-of-Intelligence) validator on the Relay network.

CONTRACT TO EVALUATE:
Title: ${contract.title}
Description: ${contract.description}
Budget: ${contract.budget_max} RELAY
Deadline: ${contract.deadline}

DELIVERABLES SUBMITTED:
${deliverablesSummary || 'No deliverables recorded.'}

SCORING DIMENSIONS (score each 0–1000):
- Task Completion (30%): Did the provider fully address the contract requirements?
- Output Quality (25%): Is the work product well-structured and valuable?
- Correctness (25%): Is the content accurate and verifiable?
- Timeliness (10%): Was it delivered before the deadline?
- Communication (10%): Are deliverables clearly documented?

Compute a weighted final score (0–1000). Then call post_to_feed with ONLY this JSON:
{"poi_score": <integer 0-1000>, "contract_id": "${contract_id}", "validator_id": "${validator.agent_id}", "rationale": "<one sentence>"}

Be objective. Scores 700+ release escrow to provider. Scores below 500 refund client.`,
          tools: ['post_to_feed', 'stop_agent'],
          taskType: 'poi-validation',
          max_iter: 3,
        }),
      }).catch(() => {})
    }

    // Schedule auto-resolution after timeout (in case validators don't respond)
    // This is handled by the next cron pulse checking for 'review' contracts > 10 minutes old
    setTimeout(async () => {
      const { data: currentContract } = await supabase
        .from('contracts')
        .select('status')
        .eq('id', contract_id)
        .single()

      if (currentContract?.status === 'review') {
        // Collect whatever scores arrived, or default to 750
        const { data: scores } = await supabase
          .from('reviews')
          .select('rating')
          .eq('contract_id', contract_id)
          .eq('review_type', 'poi_validation')

        const scoreValues = (scores ?? []).map(s => s.rating ?? 750)
        const consensus = scoreValues.length > 0 ? trimmedMean(scoreValues) : 750
        await autoScore(supabase, contract, consensus, scoreValues)
      }
    }, POI_TIMEOUT_MS)

    return NextResponse.json({
      success: true,
      contract_id,
      validators_dispatched: topValidators.length,
      status: 'review',
      timeout_ms: POI_TIMEOUT_MS,
      message: `${topValidators.length} validators dispatched. Contract moved to 'review'. Scores aggregated after ${POI_TIMEOUT_MS / 1000}s.`,
    })

  } catch (error) {
    console.error('PoI evaluate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Auto-score helper ──────────────────────────────────────────────────────────

async function autoScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contract: Record<string, string & number>,
  consensusScore: number,
  rawScores: number[]
) {
  const tier = payoutTier(consensusScore)
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
    // Refund
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
    status: newStatus,
    completed_at: new Date().toISOString(),
  }).eq('id', contract.id)

  // Update provider reputation using whitepaper formula:
  // R_new = 0.85 * R_old + 0.15 * (S* * value_weight)
  if (contract.provider_id) {
    const { data: rep } = await supabase
      .from('agent_reputation')
      .select('reputation_score, completed_contracts')
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
        reputation_score:     Math.round(rNew),
        completed_contracts:  rep.completed_contracts + (tier.providerPct > 0 ? 1 : 0),
        failed_contracts:     tier.providerPct === 0 ? 1 : 0,
        last_activity_at:     new Date().toISOString(),
      }).eq('agent_id', contract.provider_id)
    }
  }

  // Record PoI result in reviews table
  await supabase.from('reviews').insert({
    agent_id:     contract.client_id,
    reviewed_id:  contract.provider_id,
    contract_id:  contract.id,
    rating:       Math.round(consensusScore),
    comment:      `PoI consensus: ${Math.round(consensusScore)}/1000 (${tier.tier}) — ${tier.description}. Validators: ${rawScores.length}. Raw scores: [${rawScores.map(s => Math.round(s)).join(', ')}]`,
    review_type:  'poi_validation',
  })

  return NextResponse.json({
    success:         true,
    contract_id:     contract.id,
    consensus_score: Math.round(consensusScore),
    tier:            tier.tier,
    payout_pct:      tier.providerPct,
    payment_relay:   payment,
    bonus_relay:     bonus,
    new_status:      newStatus,
    validator_scores: rawScores.map(s => Math.round(s)),
    description:     tier.description,
  })
}
