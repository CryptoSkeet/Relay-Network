/**
 * POST /api/v1/wallet/swap
 * Swap RELAY ↔ SOL using Jupiter aggregator.
 * Server-side: decrypts agent key, gets Jupiter quote, signs + submits tx.
 *
 * Body: { direction: 'relay_to_sol' | 'sol_to_relay', amount: number, slippage_bps?: number }
 *
 * GET /api/v1/wallet/swap?direction=relay_to_sol&amount=100
 * Returns a quote without executing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  Connection,
  PublicKey,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js'
import { getSolanaConnection, network } from '@/lib/solana/quicknode'
import { getRelayMint } from '@/lib/solana/relay-token'
import { getKeypairFromStorage } from '@/lib/solana/generate-wallet'

const JUPITER_API = 'https://quote-api.jup.ag/v6'
const SOL_MINT = 'So11111111111111111111111111111111111111112' // wrapped SOL

// ── GET: quote only ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') // relay_to_sol | sol_to_relay
    const amountStr = searchParams.get('amount')
    const slippageBps = Number(searchParams.get('slippage_bps') || '50') // 0.5% default

    if (!direction || !amountStr) {
      return NextResponse.json({ error: 'direction and amount required' }, { status: 400 })
    }

    const amount = parseFloat(amountStr)
    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
    }

    const relayMint = await getRelayMint()
    const relayMintStr = relayMint.toString()

    let inputMint: string, outputMint: string, rawAmount: number
    if (direction === 'relay_to_sol') {
      inputMint = relayMintStr
      outputMint = SOL_MINT
      rawAmount = Math.round(amount * 1_000_000) // RELAY has 6 decimals
    } else if (direction === 'sol_to_relay') {
      inputMint = SOL_MINT
      outputMint = relayMintStr
      rawAmount = Math.round(amount * 1_000_000_000) // SOL has 9 decimals
    } else {
      return NextResponse.json({ error: 'direction must be relay_to_sol or sol_to_relay' }, { status: 400 })
    }

    const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}`
    const quoteRes = await fetch(quoteUrl)

    if (!quoteRes.ok) {
      const text = await quoteRes.text()
      return NextResponse.json({
        error: 'No swap route available',
        details: text,
        hint: network !== 'mainnet-beta'
          ? 'Jupiter swaps require mainnet liquidity. On devnet, use the faucet instead.'
          : 'No liquidity pool found for this pair.',
      }, { status: 422 })
    }

    const quote = await quoteRes.json()

    // Format output amounts
    const outDecimals = direction === 'relay_to_sol' ? 9 : 6
    const outAmount = Number(quote.outAmount) / Math.pow(10, outDecimals)
    const inDecimals = direction === 'relay_to_sol' ? 6 : 9
    const inAmount = Number(quote.inAmount) / Math.pow(10, inDecimals)

    return NextResponse.json({
      success: true,
      quote: {
        input_amount: inAmount,
        input_token: direction === 'relay_to_sol' ? 'RELAY' : 'SOL',
        output_amount: outAmount,
        output_token: direction === 'relay_to_sol' ? 'SOL' : 'RELAY',
        price_impact_pct: quote.priceImpactPct,
        slippage_bps: slippageBps,
        route_plan: quote.routePlan?.map((r: any) => r.swapInfo?.label).filter(Boolean),
      },
      raw_quote: quote,
    })
  } catch (err: any) {
    console.error('Swap quote error:', err)
    return NextResponse.json({ error: 'Failed to get swap quote' }, { status: 500 })
  }
}

// ── POST: execute swap ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { direction, amount, slippage_bps = 50 } = body

    if (!direction || !amount || amount <= 0) {
      return NextResponse.json({ error: 'direction and positive amount required' }, { status: 400 })
    }
    if (direction !== 'relay_to_sol' && direction !== 'sol_to_relay') {
      return NextResponse.json({ error: 'direction must be relay_to_sol or sol_to_relay' }, { status: 400 })
    }

    // Get user's agent + wallet
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!agent) {
      return NextResponse.json({ error: 'No agent found for your account' }, { status: 404 })
    }

    const { data: solanaWallet } = await supabase
      .from('solana_wallets')
      .select('public_key, encrypted_private_key, encryption_iv')
      .eq('agent_id', agent.id)
      .maybeSingle()

    if (!solanaWallet) {
      return NextResponse.json({ error: 'No Solana wallet found' }, { status: 404 })
    }

    // Get relay mint
    const relayMint = await getRelayMint()
    const relayMintStr = relayMint.toString()

    let inputMint: string, outputMint: string, rawAmount: number
    if (direction === 'relay_to_sol') {
      inputMint = relayMintStr
      outputMint = SOL_MINT
      rawAmount = Math.round(amount * 1_000_000)
    } else {
      inputMint = SOL_MINT
      outputMint = relayMintStr
      rawAmount = Math.round(amount * 1_000_000_000)
    }

    // 1. Get quote
    const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippage_bps}`
    const quoteRes = await fetch(quoteUrl)

    if (!quoteRes.ok) {
      return NextResponse.json({
        error: 'No swap route available',
        hint: network !== 'mainnet-beta'
          ? 'Jupiter swaps require mainnet liquidity. On devnet, use the faucet instead.'
          : 'No liquidity pool found for this pair.',
      }, { status: 422 })
    }

    const quoteData = await quoteRes.json()

    // 2. Get swap transaction from Jupiter
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: solanaWallet.public_key,
        wrapAndUnwrapSol: true,
      }),
    })

    if (!swapRes.ok) {
      const text = await swapRes.text()
      return NextResponse.json({ error: 'Failed to build swap transaction', details: text }, { status: 500 })
    }

    const { swapTransaction } = await swapRes.json()

    // 3. Sign and submit
    const connection = getSolanaConnection()
    const keypair = getKeypairFromStorage(solanaWallet.encrypted_private_key, solanaWallet.encryption_iv)

    const txBuf = Buffer.from(swapTransaction, 'base64')
    const versionedTx = VersionedTransaction.deserialize(txBuf)
    versionedTx.sign([keypair])

    const sig = await connection.sendRawTransaction(versionedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 2,
    })

    // Wait for confirmation
    await connection.confirmTransaction(sig, 'confirmed')

    // Format output for response
    const outDecimals = direction === 'relay_to_sol' ? 9 : 6
    const outAmount = Number(quoteData.outAmount) / Math.pow(10, outDecimals)
    const inDecimals = direction === 'relay_to_sol' ? 6 : 9
    const inAmount = Number(quoteData.inAmount) / Math.pow(10, inDecimals)

    return NextResponse.json({
      success: true,
      signature: sig,
      input: { amount: inAmount, token: direction === 'relay_to_sol' ? 'RELAY' : 'SOL' },
      output: { amount: outAmount, token: direction === 'relay_to_sol' ? 'SOL' : 'RELAY' },
      explorer: `https://solscan.io/tx/${sig}${network !== 'mainnet-beta' ? `?cluster=${network}` : ''}`,
    })
  } catch (err: any) {
    console.error('Swap error:', err)
    return NextResponse.json(
      { error: err.message || 'Swap failed' },
      { status: 500 },
    )
  }
}
