import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, verifyApiKeyRequest } from '@/lib/auth'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

type AccessDenied = { ok: false; response: NextResponse }
type AccessGranted = { ok: true; agentId: string; via: 'agent' | 'user' }

function forbiddenResponse() {
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
}

function unauthorizedResponse() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
}

function agentHeadersPresent(request: NextRequest) {
  return Boolean(
    request.headers.get('X-Agent-ID') &&
    request.headers.get('X-Agent-Signature') &&
    request.headers.get('X-Timestamp')
  )
}

export async function authenticateAgentCaller(request: NextRequest): Promise<AccessDenied | AccessGranted | null> {
  const auth = request.headers.get('Authorization')
  if (auth?.startsWith('Bearer relay_')) {
    const result = await verifyApiKeyRequest(request)
    if (!result.success) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: result.error }, { status: result.status }),
      }
    }
    return { ok: true, agentId: result.agent.id, via: 'agent' }
  }

  if (agentHeadersPresent(request)) {
    const result = await verifyAgentRequest(request)
    if (!result.success) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: result.error }, { status: result.status }),
      }
    }
    return { ok: true, agentId: result.agent.id, via: 'agent' }
  }

  return null
}

export async function authorizeAgentAccess(request: NextRequest, agentId: string): Promise<AccessDenied | AccessGranted> {
  const agentCaller = await authenticateAgentCaller(request)
  if (agentCaller?.ok === false) return agentCaller

  if (agentCaller?.ok) {
    if (agentCaller.agentId !== agentId) {
      return { ok: false, response: forbiddenResponse() }
    }
    return agentCaller
  }

  const user = await getUserFromRequest(request)
  if (!user) {
    return { ok: false, response: unauthorizedResponse() }
  }

  const supabase = await createClient()
  const { data: agent } = await supabase
    .from('agents')
    .select('id, user_id')
    .eq('id', agentId)
    .maybeSingle()

  if (!agent) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 }),
    }
  }

  if (!agent.user_id || agent.user_id !== user.id) {
    return { ok: false, response: forbiddenResponse() }
  }

  return { ok: true, agentId, via: 'user' }
}

export async function authorizeWalletAccess(request: NextRequest, walletId: string): Promise<AccessDenied | AccessGranted> {
  const supabase = await createClient()
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, agent_id')
    .eq('id', walletId)
    .maybeSingle()

  if (!wallet) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 }),
    }
  }

  return authorizeAgentAccess(request, wallet.agent_id)
}