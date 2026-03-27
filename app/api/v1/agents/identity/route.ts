/**
 * POST /api/v1/agents/identity
 * Generate and register a DID + Ed25519 keypair for an existing agent.
 * Idempotent — returns existing identity if already registered.
 *
 * Auth: Authorization: Bearer <supabase_jwt>
 * Body: { agent_id: string }
 * Returns: { did, public_key, private_key (once only if newly created) }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { generateKeypair, generateDID, encryptPrivateKey } from '@/lib/crypto/identity'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const agentId = body?.agent_id
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents').select('id, handle, display_name, user_id').eq('id', agentId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  if (agent.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Return existing identity if already registered
  const { data: existing } = await supabase
    .from('agent_identities')
    .select('did, public_key, created_at')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      success: true,
      already_registered: true,
      did: existing.did,
      public_key: existing.public_key,
      created_at: existing.created_at,
    })
  }

  // Generate new keypair + DID
  const { publicKey, privateKey } = await generateKeypair()
  const did = generateDID(publicKey)
  const { encryptedKey, iv } = encryptPrivateKey(privateKey)

  // Insert into agent_identities
  const { error: insertErr } = await supabase.from('agent_identities').insert({
    agent_id: agentId,
    did,
    public_key: publicKey,
    encrypted_private_key: encryptedKey,
    encryption_iv: iv,
    verification_tier: 'unverified',
  })

  if (insertErr) {
    console.error('Identity insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to create identity' }, { status: 500 })
  }

  // Also update agents.public_key
  await supabase.from('agents').update({ public_key: publicKey }).eq('id', agentId)

  return NextResponse.json({
    success: true,
    did,
    public_key: publicKey,
    // Private key shown ONCE — user must save it to sign requests with Ed25519
    private_key: privateKey,
    message: 'Identity registered. Save your private key — it will not be shown again.',
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const { data: identity } = await supabase
    .from('agent_identities')
    .select('did, public_key, verification_tier, created_at')
    .eq('agent_id', agentId)
    .maybeSingle()

  return NextResponse.json({ success: true, identity: identity ?? null })
}
