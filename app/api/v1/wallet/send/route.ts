/**
 * POST /api/v1/wallet/send
 * Authenticated RELAY transfer — user sends RELAY to another agent by handle or wallet address.
 *
 * Body: { recipient_handle?: string, recipient_address?: string, amount: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { transferRelayOnChain, ensureAgentWallet } from '@/lib/solana/relay-token'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate via Bearer token or session cookie
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const ip = getClientIp(request)
    const rl = await checkRateLimit(financialMutationRateLimit, `wallet-send:${user.id}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { recipient_handle, recipient_address, amount } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Positive amount required' }, { status: 400 })
    }
    if (!recipient_handle && !recipient_address) {
      return NextResponse.json({ error: 'recipient_handle or recipient_address required' }, { status: 400 })
    }

    // Get sender's agent
    const { data: senderAgent } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!senderAgent) {
      return NextResponse.json({ error: 'No agent found for your account' }, { status: 404 })
    }

    // Resolve recipient
    let recipientAgentId: string | null = null
    let recipientPublicKey: string | null = null

    if (recipient_handle) {
      const { data: recipientAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('handle', recipient_handle)
        .maybeSingle()

      if (!recipientAgent) {
        return NextResponse.json({ error: `Agent @${recipient_handle} not found` }, { status: 404 })
      }
      if (recipientAgent.id === senderAgent.id) {
        return NextResponse.json({ error: 'Cannot send to yourself' }, { status: 400 })
      }
      recipientAgentId = recipientAgent.id
    } else if (recipient_address) {
      // Find agent by wallet address
      const { data: recipientWallet } = await supabase
        .from('solana_wallets')
        .select('agent_id')
        .eq('public_key', recipient_address)
        .maybeSingle()

      if (recipientWallet) {
        if (recipientWallet.agent_id === senderAgent.id) {
          return NextResponse.json({ error: 'Cannot send to yourself' }, { status: 400 })
        }
        recipientAgentId = recipientWallet.agent_id
      } else {
        recipientPublicKey = recipient_address
      }
    }

    // Load sender wallet
    const { data: senderWallet } = await supabase
      .from('solana_wallets')
      .select('public_key, encrypted_private_key, encryption_iv')
      .eq('agent_id', senderAgent.id)
      .maybeSingle()

    if (!senderWallet) {
      return NextResponse.json({ error: 'No Solana wallet found for your agent' }, { status: 404 })
    }

    // Resolve recipient public key
    if (recipientAgentId && !recipientPublicKey) {
      const wallet = await ensureAgentWallet(recipientAgentId)
      recipientPublicKey = wallet.publicKey
    }

    if (!recipientPublicKey) {
      return NextResponse.json({ error: 'Could not resolve recipient wallet' }, { status: 400 })
    }

    // Execute on-chain transfer
    const sig = await transferRelayOnChain(
      senderWallet.encrypted_private_key,
      senderWallet.encryption_iv,
      senderWallet.public_key,
      recipientPublicKey,
      amount,
    )

    // Sync DB wallets
    const { data: senderDbWallet } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('agent_id', senderAgent.id)
      .maybeSingle()

    if (senderDbWallet) {
      await supabase.from('wallets')
        .update({ balance: Math.max(0, (senderDbWallet.balance || 0) - amount) })
        .eq('id', senderDbWallet.id)
    }

    if (recipientAgentId) {
      const { data: recipientDbWallet } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('agent_id', recipientAgentId)
        .maybeSingle()

      if (recipientDbWallet) {
        await supabase.from('wallets')
          .update({ balance: (recipientDbWallet.balance || 0) + amount })
          .eq('id', recipientDbWallet.id)
      }
    }

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'

    return NextResponse.json({
      success: true,
      on_chain_sig: sig,
      amount,
      from: senderWallet.public_key,
      to: recipientPublicKey,
      explorer: `https://solscan.io/tx/${sig}${network !== 'mainnet-beta' ? `?cluster=${network}` : ''}`,
    })
  } catch (err: any) {
    console.error('Send error:', err)
    return NextResponse.json(
      { error: err.message || 'Transfer failed' },
      { status: 500 },
    )
  }
}
