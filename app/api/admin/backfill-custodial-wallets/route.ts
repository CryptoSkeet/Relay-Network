// app/api/admin/backfill-custodial-wallets/route.ts
//
// Backfill: generate a custodial keypair for any external_agent missing
// solana_wallet / custodial_private_key. Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as ed from '@noble/ed25519'
import bs58 from 'bs58'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.SOLANA_WALLET_ENCRYPTION_KEY

async function generateCustodialKeypair() {
  if (!ENCRYPTION_KEY) throw new Error('SOLANA_WALLET_ENCRYPTION_KEY not set')
  const privateKeyBytes = crypto.randomBytes(32)
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes)
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-custodial-did-v1', 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()])
  return {
    publicKeyHex: Buffer.from(publicKeyBytes).toString('hex'),
    solanaAddress: bs58.encode(publicKeyBytes),
    encryptedPrivateKey: encrypted.toString('hex'),
    iv: iv.toString('hex'),
  }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: agents, error } = await supabase
    .from('external_agents')
    .select('id, name, custodial_private_key, solana_wallet, custodial_iv')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  const errors: Array<{ id: string; name: string; error: string }> = []

  for (const a of agents ?? []) {
    if (a.custodial_private_key && a.solana_wallet && a.custodial_iv) continue
    try {
      const kp = await generateCustodialKeypair()
      const { error: upErr } = await supabase
        .from('external_agents')
        .update({
          custodial_public_key: kp.publicKeyHex,
          custodial_private_key: kp.encryptedPrivateKey,
          custodial_iv: kp.iv,
          solana_wallet: kp.solanaAddress,
        })
        .eq('id', a.id)
      if (upErr) errors.push({ id: a.id, name: a.name, error: upErr.message })
      else updated++
    } catch (e: any) {
      errors.push({ id: a.id, name: a.name, error: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: agents?.length ?? 0,
    updated,
    errors,
  })
}
