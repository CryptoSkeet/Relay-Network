/**
 * POST /api/v1/relay-token/mint
 * Mint RELAY tokens to an agent's on-chain wallet and credit the DB.
 * Called after contract completion, bounty claims, or admin grants.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mintRelayTokens, ensureAgentWallet } from '@/lib/solana/relay-token'
import { RelaySendError } from '@/lib/solana/send'
import { internalFinancialRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'

// Transient RPC failures (BLOCKHASH_EXPIRED, SEND_FAILED) account for the
// residual ~10% mint failure rate after the heartbeat-UA fix. Retry these
// classes — each retry gets a fresh blockhash inside sendAndConfirm.
const TRANSIENT_KINDS = new Set(['BLOCKHASH_EXPIRED', 'SEND_FAILED'])
const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 400

async function mintWithRetry(
  publicKey: string,
  amount: number,
  memo: string,
): Promise<{ sig: string; attempts: number }> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const sig = await mintRelayTokens(publicKey, amount, memo)
      return { sig, attempts: attempt }
    } catch (err) {
      lastErr = err
      const transient = err instanceof RelaySendError && TRANSIENT_KINDS.has(err.kind)
      if (!transient || attempt === MAX_ATTEMPTS) break
      // Exponential backoff with jitter.
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

function describeError(err: unknown): string {
  if (err instanceof RelaySendError) {
    const causeMsg =
      err.cause instanceof Error
        ? err.cause.message
        : err.cause !== undefined
          ? String(err.cause)
          : null
    return causeMsg ? `${err.kind}: ${err.message} — ${causeMsg}` : `${err.kind}: ${err.message}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization')
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { agent_id, amount, reason = 'earnings', contract_id } = await request.json()
    if (!agent_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'agent_id and positive amount required' }, { status: 400 })
    }

    const rl = await checkRateLimit(internalFinancialRateLimit, `relay-mint:${agent_id}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const supabase = await createClient()

    // Ensure agent has a wallet
    const wallet = await ensureAgentWallet(agent_id)

    // Per-contract memo gives forensic auditability AND lets downstream
    // callers de-dupe by memo (combined with item 1's atomic claim).
    // Falls back to a stable agent-level marker for non-contract mints
    // (admin grants, signup bonuses go through their own dedicated path).
    const memo = contract_id
      ? `relay:contract:${contract_id}:settled`
      : `relay:earn:${agent_id}:${reason}`

    // Mint on-chain (with retry for transient RPC failures)
    const { sig, attempts } = await mintWithRetry(wallet.publicKey, amount, memo)

    // Credit in DB
    const { data: dbWallet } = await supabase
      .from('wallets').select('id, balance').eq('agent_id', agent_id).maybeSingle()

    if (dbWallet) {
      await supabase.from('wallets')
        .update({ balance: (dbWallet.balance || 0) + amount })
        .eq('id', dbWallet.id)

      await supabase.from('transactions').insert({
        wallet_id: dbWallet.id,
        type: 'earned',
        amount,
        description: `${reason}: ${amount} RELAY minted on-chain`,
        metadata: { on_chain_sig: sig, network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet' },
      }).then(() => {})
    }

    return NextResponse.json({
      success: true,
      on_chain_sig: sig,
      amount,
      wallet: wallet.publicKey,
      attempts,
    })
  } catch (err) {
    console.error('Mint error:', err)
    return NextResponse.json({ error: describeError(err) }, { status: 500 })
  }
}
