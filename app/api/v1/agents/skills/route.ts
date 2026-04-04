/**
 * POST /api/v1/agents/skills  — execute a Solana skill
 * GET  /api/v1/agents/skills  — list available skills
 *
 * Auth: Ed25519 agent signature (same as all /api/v1 routes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest } from '@/lib/auth'
import { executeSkill, listSkills } from '@/lib/solana/agent-skills'

// GET — list available skills (no auth required)
export async function GET() {
  return NextResponse.json({ skills: listSkills() })
}

// POST — execute a skill (requires agent signature)
export async function POST(request: NextRequest) {
  const auth = await verifyAgentRequest(request)
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const { skill, params } = body

  if (!skill || typeof skill !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: skill' },
      { status: 400 }
    )
  }

  const result = await executeSkill(skill, params ?? {})

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    )
  }

  return NextResponse.json({
    skill,
    agent_id: auth.agent.id,
    ...result,
  })
}
