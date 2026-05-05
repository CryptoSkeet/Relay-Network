/**
 * POST /api/v1/wallet/link/verify
 *
 * Body: { address: string, nonce: string, signature: string }
 *   - signature: base64-encoded 64-byte Ed25519 signature over the challenge message
 *
 * On success, inserts a row in `linked_wallets` and returns the row.
 * The challenge is consumed (deleted) regardless of outcome.
 *
 * Auth: cookie session OR Bearer JWT.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as ed from '@noble/ed25519'
import bs58 from 'bs58'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'))
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as
    | { address?: string; nonce?: string; signature?: string; label?: string; network?: string }
    | null

  const address = body?.address?.trim()
  const nonce = body?.nonce?.trim()
  const signature = body?.signature?.trim()
  const label = body?.label?.trim() || null
  const network = body?.network?.trim() || 'solana:mainnet'

  if (!address || !nonce || !signature) {
    return NextResponse.json({ error: 'Missing address, nonce, or signature' }, { status: 400 })
  }

  const supabase = await createClient()

  // 1. Look up + consume the challenge.
  const { data: challenge, error: chErr } = await supabase
    .from('wallet_link_challenges')
    .select('nonce, user_id, address, expires_at')
    .eq('nonce', nonce)
    .maybeSingle()

  if (chErr) {
    return NextResponse.json({ error: `Challenge lookup failed: ${chErr.message}` }, { status: 500 })
  }
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found or already used' }, { status: 400 })
  }

  // Always consume the nonce so it can't be replayed.
  await supabase.from('wallet_link_challenges').delete().eq('nonce', nonce)

  if (challenge.user_id !== user.id) {
    return NextResponse.json({ error: 'Challenge does not belong to this user' }, { status: 403 })
  }
  if (challenge.address !== address) {
    return NextResponse.json({ error: 'Challenge address mismatch' }, { status: 400 })
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Challenge expired — request a new one' }, { status: 400 })
  }

  // 2. Reconstruct the exact message the client was told to sign.
  const message = `Relay Network — link wallet\nAddress: ${address}\nUser: ${user.id}\nNonce: ${nonce}\nExpires: ${challenge.expires_at}`
  const messageBytes = new TextEncoder().encode(message)

  // 3. Verify signature using base58 pubkey + base64 signature.
  let valid = false
  try {
    const pubkeyBytes = bs58.decode(address)
    const sigBytes = fromBase64(signature)
    if (pubkeyBytes.length !== 32 || sigBytes.length !== 64) {
      return NextResponse.json({ error: 'Bad pubkey or signature length' }, { status: 400 })
    }
    valid = await ed.verify(sigBytes, messageBytes, pubkeyBytes)
  } catch (e: any) {
    return NextResponse.json({ error: `Signature verification failed: ${e?.message ?? 'unknown'}` }, { status: 400 })
  }

  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 4. Persist the linked wallet (upsert on (user_id, address)).
  const { data: existingForUser } = await supabase
    .from('linked_wallets')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  const isPrimary = !(existingForUser && existingForUser.length > 0)

  const { data: row, error: insErr } = await supabase
    .from('linked_wallets')
    .upsert(
      {
        user_id: user.id,
        address,
        label,
        network,
        is_primary: isPrimary,
        verified_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,address' },
    )
    .select('id, address, label, network, is_primary, verified_at, created_at')
    .single()

  if (insErr || !row) {
    return NextResponse.json(
      { error: `Failed to save linked wallet: ${insErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, wallet: row })
}
