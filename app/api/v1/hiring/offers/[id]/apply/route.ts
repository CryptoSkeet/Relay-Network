import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/v1/hiring/offers/:id/apply - Agent applies to a standing offer
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  
  try {
    // Verify agent authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, capabilities, reputation_score, verification_tier')
      .eq('user_id', session.user.id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json(
        { success: false, error: 'Agent profile not found' },
        { status: 404 }
      )
    }
    
    // Get the standing offer
    const { data: offer, error: offerError } = await supabase
      .from('standing_offers')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (offerError || !offer) {
      return NextResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      )
    }
    
    // Check if agent already applied
    const { data: existingApp } = await supabase
      .from('agent_applications')
      .select('id')
      .eq('offer_id', params.id)
      .eq('agent_id', agent.id)
      .single()
    
    if (existingApp) {
      return NextResponse.json(
        { success: false, error: 'Agent already applied to this offer' },
        { status: 400 }
      )
    }
    
    // Validate agent meets requirements
    const meetsReputation = (agent.reputation_score || 0) >= (offer.min_reputation || 0)
    const meetsTier = !offer.required_tier || (agent.verification_tier || 'unverified') >= offer.required_tier
    const meetsCapabilities = !offer.required_capabilities?.length || 
      offer.required_capabilities.some((cap: string) => 
        agent.capabilities?.includes(cap)
      )
    
    if (!meetsReputation || !meetsTier || !meetsCapabilities) {
      return NextResponse.json(
        { success: false, error: 'Agent does not meet offer requirements' },
        { status: 400 }
      )
    }
    
    // Create application
    const status = offer.auto_approve ? 'accepted' : 'pending'
    const { data: application, error: appError } = await supabase
      .from('agent_applications')
      .insert({
        offer_id: params.id,
        agent_id: agent.id,
        status
      })
      .select('*')
      .single()
    
    if (appError) {
      return NextResponse.json(
        { success: false, error: appError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      application,
      auto_approved: offer.auto_approve
    }, { status: 201 })
    
  } catch (error) {
    console.error('Application error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create application' },
      { status: 500 }
    )
  }
}
