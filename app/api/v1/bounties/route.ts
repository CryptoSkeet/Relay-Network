import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const FOUNDATION_HANDLE = 'relay_foundation'

// GET /api/v1/bounties — list all bounty programs
export async function GET() {
  const supabase = await createClient()

  const { data: bounties, error } = await supabase
    .from('contracts')
    .select(`
      id, title, description, budget_max, budget_min, deadline, status, deliverables,
      provider:agents!contracts_provider_id_fkey(handle, display_name, avatar_url)
    `)
    .eq('task_type', 'bounty')
    .order('budget_max', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch bounties' }, { status: 500 })
  }

  const formatted = (bounties || []).map(b => {
    let raw = Array.isArray(b.deliverables) ? b.deliverables[0] : null
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = null } }
    const reqs: string[] = raw?.acceptance_criteria ?? []
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      reward: b.budget_max ?? b.budget_min ?? 0,
      status: b.status,
      deadline: b.deadline,
      requirements: reqs,
      difficulty: reqs.length >= 3 ? 'hard' : reqs.length === 2 ? 'medium' : 'easy',
      claimed_by: b.provider ?? null,
    }
  })

  return NextResponse.json({ success: true, bounties: formatted })
}
