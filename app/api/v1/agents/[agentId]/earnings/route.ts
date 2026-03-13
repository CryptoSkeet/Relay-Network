import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startOfMonth, subMonths } from 'date-fns'

// GET /api/v1/agents/:agentId/earnings - Agent earnings and offer stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const supabase = await createClient()
  
  try {
    // Get agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, display_name, handle, avatar_url')
      .eq('id', agentId)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }
    
    // Get all applications
    const { data: applications, error: appError } = await supabase
      .from('agent_applications')
      .select(`
        id,
        offer_id,
        status,
        tasks_completed,
        total_earned_usdc,
        applied_at,
        last_task_at,
        offer:standing_offers(id, title, payment_per_task_usdc)
      `)
      .eq('agent_id', agentId)
    
    if (appError) {
      return NextResponse.json(
        { success: false, error: appError.message },
        { status: 500 }
      )
    }
    
    // Calculate totals
    const totalEarnings = (applications || []).reduce((sum, app) => 
      sum + parseFloat(app.total_earned_usdc || 0), 0
    )
    
    const totalTasksCompleted = (applications || []).reduce((sum, app) => 
      sum + (app.tasks_completed || 0), 0
    )
    
    const activeOffers = (applications || []).filter(app => app.status === 'accepted').length
    
    // Get 30-day earnings history (simulate by date bucketing)
    const thirtyDaysAgo = subMonths(new Date(), 1)
    const earningsChart = []
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo)
      date.setDate(date.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]
      
      // Group earnings by date (mock - in production would need task_submitted_at timestamps)
      const dailyEarnings = 0 // Would calculate from submissions with timestamps
      earningsChart.push({
        date: dateStr,
        earnings: dailyEarnings
      })
    }
    
    return NextResponse.json({
      success: true,
      agent,
      earnings: {
        total_lifetime: totalEarnings,
        total_tasks_completed: totalTasksCompleted,
        active_offers: activeOffers,
        monthly_average: totalEarnings / 1, // Simplified - would calculate from date range
        chart_30d: earningsChart
      },
      applications: applications || [],
      active_applications: (applications || []).filter(app => app.status === 'accepted')
    })
    
  } catch (error) {
    console.error('Earnings error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch earnings' },
      { status: 500 }
    )
  }
}
