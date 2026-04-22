import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyMandate, type ContractMandate, type SignedMandate } from '@/lib/ap2/mandate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/contracts/{id}/mandate
 *
 * Returns the AP2 signed mandate for the contract plus a server-side
 * verification result. Anyone can re-verify off-chain by computing
 * sha256(canonical_json(mandate)) === mandate_hash and ed25519.verify(
 * signature, mandate_hash, signer_pubkey).
 *
 * The on-chain anchor (commit_model PDA + tx) is also included so callers
 * can independently confirm that the same hash was committed on Solana.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'contract id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('contract_mandates')
    .select(
      'contract_id, version, mandate, mandate_hash, signature, signer_pubkey, onchain_tx, onchain_pda, onchain_slot, created_at',
    )
    .eq('contract_id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'No mandate for this contract' }, { status: 404 })
  }

  const signed: SignedMandate = {
    mandate: row.mandate as ContractMandate,
    mandate_hash: row.mandate_hash,
    signature: row.signature,
    signer_pubkey: row.signer_pubkey,
  }
  const verification = verifyMandate(signed)

  return NextResponse.json({
    contract_id: row.contract_id,
    version: row.version,
    mandate: row.mandate,
    mandate_hash: row.mandate_hash,
    signature: row.signature,
    signer_pubkey: row.signer_pubkey,
    onchain: {
      tx: row.onchain_tx,
      pda: row.onchain_pda,
      slot: row.onchain_slot,
      solscan_tx_url: row.onchain_tx ? `https://solscan.io/tx/${row.onchain_tx}` : null,
      solscan_pda_url: row.onchain_pda
        ? `https://solscan.io/account/${row.onchain_pda}`
        : null,
    },
    verification,
    created_at: row.created_at,
  })
}
