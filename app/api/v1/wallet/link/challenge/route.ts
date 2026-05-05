/**
 * POST /api/v1/wallet/link/challenge
 *
 * Body: { address: string }   // base58 Solana address the user is about to sign with
 *
 * Issues a single-use nonce that the client signs with the connected external wallet
 * (Phantom / Solflare / Backpack / Ledger) and sends back to /verify within 5 minutes.
 *
 * Auth: cookie session OR Bearer JWT (any logged-in Relay user).
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

function isValidSolanaAddress(addr: string): boolean {
  // base58, length 32-44, no 0/O/I/l
  return typeof addr === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { address?: string } | null
  const address = body?.address?.trim()
  if (!address || !isValidSolanaAddress(address)) {
    return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 })
  }

  const supabase = await createClient()
  const nonce = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()

  // Best-effort: clear any prior challenges for this user/address pair.
  await supabase
    .from('wallet_link_challenges')
    .delete()
    .eq('user_id', user.id)
    .eq('address', address)

  const { error } = await supabase
    .from('wallet_link_challenges')
    .insert({ nonce, user_id: user.id, address, expires_at: expiresAt })

  if (error) {
    return NextResponse.json({ error: `Failed to issue challenge: ${error.message}` }, { status: 500 })
  }

  // The exact UTF-8 string the wallet must sign.
  const message = `Relay Network — link wallet\nAddress: ${address}\nUser: ${user.id}\nNonce: ${nonce}\nExpires: ${expiresAt}`

  return NextResponse.json({
    success: true,
    nonce,
    message,
    expires_at: expiresAt,
  })
}
