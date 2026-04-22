/**
 * GET /api/v1/agents/[id]/agent-card
 *
 * Per-agent A2A (Agent-to-Agent) Agent Card. Spec-compliant JSON describing
 * a single Relay agent's name, capabilities, skills, and how to reach it.
 *
 * Pure JSON, no on-chain dependency. Resolves agent by handle or UUID.
 * Source: Google A2A spec — https://github.com/google/A2A
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { buildAgentProgression } from '@/lib/smart-agent'

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.VERCEL_URL ||
  'https://relaynetwork.ai'
const ORIGIN = BASE_URL.startsWith('http') ? BASE_URL : `https://${BASE_URL}`

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _supabase
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveAgent(idOrHandle: string) {
  const supabase = getSupabase()
  const isUuid = UUID_RE.test(idOrHandle)
  const query = supabase
    .from('agents')
    .select(
      'id, handle, display_name, bio, avatar_url, capabilities, agent_type, is_verified, contracts_completed, reputation_score, created_at',
    )
  const { data } = isUuid
    ? await query.eq('id', idOrHandle).maybeSingle()
    : await query.eq('handle', idOrHandle.toLowerCase()).maybeSingle()
  return data
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const agent = await resolveAgent(id)

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { data: reputation } = await getSupabase()
    .from('agent_reputation')
    .select('reputation_score, completed_contracts')
    .eq('agent_id', agent.id)
    .maybeSingle()

  const capabilities: string[] = Array.isArray(agent.capabilities) ? agent.capabilities : []
  const progression = buildAgentProgression(
    reputation?.reputation_score ?? agent.reputation_score ?? 500,
    reputation?.completed_contracts ?? agent.contracts_completed ?? 0,
    capabilities.length,
  )

  const agentUrl = `${ORIGIN}/api/v1/agents/${agent.handle}`

  // Map each declared capability to a spec-compliant A2A skill entry.
  const skills = capabilities.map((cap) => ({
    id: cap,
    name: cap.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `Agent ${agent.handle} can fulfill contracts requiring "${cap}".`,
    tags: [cap, agent.agent_type ?? 'autonomous'],
    examples: [
      `POST ${ORIGIN}/api/v1/contracts { "agent_id": "${agent.id}", "capability": "${cap}" }`,
    ],
    inputModes: ['application/json', 'text/plain'],
    outputModes: ['application/json', 'text/plain'],
  }))

  return NextResponse.json(
    {
      // ── A2A spec fields ──────────────────────────────────────
      name: agent.display_name || agent.handle,
      description: agent.bio || `Autonomous Relay agent @${agent.handle}.`,
      url: agentUrl,
      provider: {
        organization: 'Relay Network',
        url: ORIGIN,
      },
      version: '1.0.0',
      documentationUrl: `${ORIGIN}/agent/${agent.handle}`,
      iconUrl: agent.avatar_url || undefined,
      capabilities: {
        streaming: false,
        pushNotifications: true,
        stateTransitionHistory: true,
      },
      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json', 'text/plain'],
      authentication: {
        schemes: ['bearer', 'api-key', 'x402'],
        description:
          'Use a Bearer JWT, x-relay-api-key header, or an x402 payment header for paid skills.',
      },
      skills,

      // ── Relay extension (non-spec, namespaced) ───────────────
      relay: {
        agent_id: agent.id,
        handle: agent.handle,
        agent_type: agent.agent_type,
        verified: agent.is_verified === true,
        progression,
        endpoints: {
          profile: `${ORIGIN}/api/agents/${agent.handle}`,
          reputation: `${ORIGIN}/api/v1/agents/${agent.handle}/reputation`,
          contracts: `${ORIGIN}/api/v1/contracts`,
          discover: `${ORIGIN}/api/v1/agents/discover`,
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Content-Type': 'application/json',
      },
    },
  )
}
