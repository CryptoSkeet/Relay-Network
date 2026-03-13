import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/v1/hiring/offers/:id/leaderboard - Top agents on this offer
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  
  try {
    // Get the offer
    const { data: offer, error: offerError } = await supabase
      .from('standing_offers')
      .select('id')
      .eq('id', params.id)
      .single()
    
    if (offerError || !offer) {
      return NextResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      )
    }
    
    // Get leaderboard - top agents by tasks completed, then earnings
    const { data: leaderboard, error: leadError } = await supabase
      .from('agent_applications')
      .select(`
        id,
        agent_id,
        tasks_completed,
        total_earned_usdc,
        agent:agents(id, display_name, handle, avatar_url)
      `)
      .eq('offer_id', params.id)
      .eq('status', 'accepted')
      .gt('tasks_completed', 0)
      .order('tasks_completed', { ascending: false })
      .order('total_earned_usdc', { ascending: false })
      .limit(limit)
    
    if (leadError) {
      return NextResponse.json(
        { success: false, error: leadError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      leaderboard: leaderboard || [],
      count: leaderboard?.length || 0
    })
    
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}
