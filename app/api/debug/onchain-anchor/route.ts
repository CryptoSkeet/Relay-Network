/**
 * GET /api/debug/onchain-anchor — diagnostic for the relay_reputation bridge.
 *
 * Protected by CRON_SECRET. Generates a fresh keypair, calls
 * `recordSettlementOnChain` directly, and returns the tx signature, derived
 * PDA, Solscan URLs, and the resolved RPC URL / cluster — or the full error.
 *
 * Use this to diagnose silent anchor failures on Vercel without trawling logs.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://relaynetwork.ai/api/debug/onchain-anchor
 */
import { NextRequest, NextResponse } from 'next/server'
import { Keypair } from '@solana/web3.js'
import { randomUUID } from 'crypto'
import {
  recordSettlementOnChain,
  Outcome,
  deriveReputationPDA,
  RELAY_REPUTATION_PROGRAM_ID,
} from '@/lib/solana/relay-reputation'
import { solscanTxUrl, solscanAccountUrl } from '@/lib/solana/agent-profile'
import { getSolanaConnection } from '@/lib/solana/quicknode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sanitize(u: string | undefined): string {
  return (u ?? '').replace(/\\r|\\n|\r|\n/g, '').trim()
}

export async function GET(request: NextRequest) {
  // Feature flag — debug routes are off by default in prod. Enable by setting
  // ENABLE_DEBUG_ROUTES=1 in Vercel env. CRON_SECRET is still required.
  if (process.env.ENABLE_DEBUG_ROUTES !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const env = {
    SOLANA_CLUSTER: process.env.SOLANA_CLUSTER ?? null,
    NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? null,
    QUICKNODE_RPC_URL_present: Boolean(process.env.QUICKNODE_RPC_URL),
    QUICKNODE_RPC_URL_sanitized: sanitize(process.env.QUICKNODE_RPC_URL),
    NEXT_PUBLIC_SOLANA_RPC_present: Boolean(process.env.NEXT_PUBLIC_SOLANA_RPC),
    NEXT_PUBLIC_SOLANA_RPC_sanitized: sanitize(process.env.NEXT_PUBLIC_SOLANA_RPC),
    RELAY_PAYER_SECRET_KEY_present: Boolean(process.env.RELAY_PAYER_SECRET_KEY),
    RELAY_PAYER_SECRET_KEY_format:
      process.env.RELAY_PAYER_SECRET_KEY?.includes(',') ? 'comma-bytes'
        : process.env.RELAY_PAYER_SECRET_KEY ? 'other'
        : null,
    program_id: RELAY_REPUTATION_PROGRAM_ID.toBase58(),
  }

  // Resolved connection (what the bridge will actually use)
  let rpcEndpoint: string | null = null
  let rpcVersion: unknown = null
  let rpcError: string | null = null
  try {
    const conn = getSolanaConnection()
    rpcEndpoint = (conn as any)._rpcEndpoint ?? null
    rpcVersion = await conn.getVersion()
  } catch (e: any) {
    rpcError = e?.message ?? String(e)
  }

  // Skip the actual anchor unless explicitly requested with ?execute=1
  const execute = request.nextUrl.searchParams.get('execute') === '1'
  if (!execute) {
    return NextResponse.json({
      ok: true,
      execute: false,
      hint: 'Add ?execute=1 to actually send a tx',
      env,
      rpc: { endpoint: rpcEndpoint, version: rpcVersion, error: rpcError },
    })
  }

  // Generate a fresh DID and try to anchor
  const seller = Keypair.generate().publicKey
  const [pda] = deriveReputationPDA(seller)
  const contractId = randomUUID()

  // If caller passed ?agentId=..., exercise the bridge path that
  // `lib/contract-engine.js` uses — resolves wallet from DB, then anchors.
  const agentId = request.nextUrl.searchParams.get('agentId')
  if (agentId) {
    try {
      const { anchorReputationForAgent } = await import(
        '@/lib/solana/relay-reputation-bridge'
      )
      const sig = await anchorReputationForAgent({
        agentId,
        contractId,
        amount: 1,
        outcome: 'Settled',
        score: 1000,
      })
      return NextResponse.json({
        ok: sig != null,
        execute: true,
        path: 'bridge',
        env,
        rpc: { endpoint: rpcEndpoint, version: rpcVersion, error: rpcError },
        bridge: {
          agent_id: agentId,
          contract_id: contractId,
          tx_signature: sig,
          solscan_tx: sig ? solscanTxUrl(sig) : null,
        },
      })
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          execute: true,
          path: 'bridge',
          env,
          rpc: { endpoint: rpcEndpoint, version: rpcVersion, error: rpcError },
          error: {
            message: e?.message ?? String(e),
            name: e?.name ?? null,
            stack:
              typeof e?.stack === 'string'
                ? e.stack.split('\n').slice(0, 8).join('\n')
                : null,
            logs: Array.isArray(e?.logs) ? e.logs : null,
          },
        },
        { status: 500 },
      )
    }
  }

  try {
    const sig = await recordSettlementOnChain({
      agentDid: seller,
      contractId,
      amount: BigInt(1),
      outcome: Outcome.Settled,
      score: 1000,
    })
    return NextResponse.json({
      ok: true,
      execute: true,
      env,
      rpc: { endpoint: rpcEndpoint, version: rpcVersion, error: rpcError },
      anchor: {
        seller_wallet: seller.toBase58(),
        contract_id: contractId,
        reputation_pda: pda.toBase58(),
        tx_signature: sig,
        solscan_tx: solscanTxUrl(sig),
        solscan_pda: solscanAccountUrl(pda),
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        execute: true,
        env,
        rpc: { endpoint: rpcEndpoint, version: rpcVersion, error: rpcError },
        error: {
          message: e?.message ?? String(e),
          name: e?.name ?? null,
          stack: typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 6).join('\n') : null,
          logs: Array.isArray(e?.logs) ? e.logs : null,
        },
      },
      { status: 500 },
    )
  }
}
