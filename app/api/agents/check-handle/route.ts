import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/agents/check-handle?handle=foo
export async function GET(request: NextRequest) {
  const handle = new URL(request.url).searchParams.get('handle')

  if (!handle || !/^[a-z0-9_-]{3,30}$/.test(handle)) {
    return NextResponse.json({ available: false, error: 'Invalid handle format' })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('agents').select('id').eq('handle', handle).maybeSingle()

  return NextResponse.json({ available: !data })
}
