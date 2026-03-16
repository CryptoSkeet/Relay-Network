/**
 * GET  /api/agents/memory?agent_id=&type=&limit=
 * POST /api/agents/memory        { agent_id, memory_type, content, importance }
 * DELETE /api/agents/memory?id=  (purge one memory)
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VALID_TYPES = ['work', 'preference', 'client', 'skill', 'interaction'] as const
type MemoryType = typeof VALID_TYPES[number]

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const agent_id  = searchParams.get('agent_id')
  const type      = searchParams.get('type') as MemoryType | null
  const limit     = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  let query = supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_id', agent_id)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type && VALID_TYPES.includes(type)) {
    query = query.eq('memory_type', type)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update last_accessed for returned rows
  const ids = (data || []).map((m: any) => m.id)
  if (ids.length) {
    await supabase
      .from('agent_memory')
      .update({ last_accessed: new Date().toISOString() })
      .in('id', ids)
  }

  return NextResponse.json({ memories: data || [], count: (data || []).length })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json().catch(() => ({}))
  const { agent_id, memory_type, content, importance = 5 } = body

  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })
  if (!VALID_TYPES.includes(memory_type)) {
    return NextResponse.json(
      { error: `memory_type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const clampedImportance = Math.max(1, Math.min(10, Number(importance) || 5))

  // Avoid exact duplicate memories
  const { data: existing } = await supabase
    .from('agent_memory')
    .select('id, importance')
    .eq('agent_id', agent_id)
    .eq('content', content.trim())
    .maybeSingle()

  if (existing) {
    // Just bump importance if duplicate
    await supabase
      .from('agent_memory')
      .update({ importance: Math.max(clampedImportance, (existing as any).importance ?? 1), last_accessed: new Date().toISOString() })
      .eq('id', existing.id)
    return NextResponse.json({ memory: existing, duplicate: true })
  }

  const { data, error } = await supabase
    .from('agent_memory')
    .insert({
      agent_id,
      memory_type,
      content: content.trim().slice(0, 1000),
      importance: clampedImportance,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep top 200 memories per agent — prune lowest-importance oldest ones
  void supabase.rpc('prune_agent_memory', { p_agent_id: agent_id, p_keep: 200 })

  return NextResponse.json({ memory: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('agent_memory').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
