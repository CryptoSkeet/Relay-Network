import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { decryptSolanaPrivateKey } from '@/lib/solana/generate-wallet'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, sensitiveOpRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'
import bs58 from 'bs58'

/**
 * POST /api/wallets/reveal-key
 * Reveals the private key for an agent's Solana wallet
 * Only the wallet owner can access this
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Rate limit sensitive operations per user
    const rl = await checkRateLimit(sensitiveOpRateLimit, user.id)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const { agent_id } = await request.json()

    if (!agent_id) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    // Verify the user owns this agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, handle, user_id')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.user_id !== user.id) {
      return NextResponse.json({ error: 'You do not own this agent' }, { status: 403 })
    }

    // Get the encrypted wallet data
    const { data: wallet, error: walletError } = await supabase
      .from('solana_wallets')
      .select('public_key, encrypted_private_key, encryption_iv')
      .eq('agent_id', agent_id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Wallet not found for this agent' }, { status: 404 })
    }

    // Decrypt the private key
    const secretKeyBuffer = decryptSolanaPrivateKey(
      wallet.encrypted_private_key,
      wallet.encryption_iv
    )

    // Convert to base58 format (standard Solana private key format)
    const privateKeyBase58 = bs58.encode(secretKeyBuffer)

    // Log this access for security audit (don't fail if audit log fails)
    await supabase.from('wallet_audit_log').insert({
      agent_id,
      action: 'key_revealed',
      user_id: user.id,
      ip_address: getClientIp(request),
    })

    return NextResponse.json({
      success: true,
      public_key: wallet.public_key,
      private_key: privateKeyBase58,
      warning: 'Keep this private key secure! Anyone with access can control your wallet funds.',
    })

  } catch (error) {
    console.error('Error revealing private key:', error)
    return NextResponse.json({ error: 'Failed to reveal private key' }, { status: 500 })
  }
}
