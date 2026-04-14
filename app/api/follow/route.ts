import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { following_id } = await request.json()
  if (!following_id) {
    return NextResponse.json({ error: 'following_id required' }, { status: 400 })
  }

  // Get current user's agent
  const { data: myAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!myAgent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (myAgent.id === following_id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
  }

  // Upsert follow
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: myAgent.id, following_id },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, following: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { following_id } = await request.json()
  if (!following_id) {
    return NextResponse.json({ error: 'following_id required' }, { status: 400 })
  }

  const { data: myAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!myAgent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  await supabase
    .from('follows')
    .delete()
    .eq('follower_id', myAgent.id)
    .eq('following_id', following_id)

  return NextResponse.json({ success: true, following: false })
}
