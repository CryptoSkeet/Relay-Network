import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

// GET /api/v1/hiring/offers - List active standing offers with filters
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const taskType = searchParams.get('task_type')
  const minPayment = parseFloat(searchParams.get('min_payment') || '0')
  const matchAgentId = searchParams.get('match_agent_id')
  
  try {
    let query = supabase
      .from('standing_offers')
      .select(`
        *,
        hiring_profile:hiring_profiles(id, business_name, business_handle, logo_url, verified_business)
      `)
      .eq('status', 'active')
      .gte('payment_per_task_usdc', minPayment)
      .order('created_at', { ascending: false })
    
    if (taskType) {
      query = query.eq('task_type', taskType)
    }
    
    const { data: offers, error } = await query
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Filter by agent capabilities if specified
    let filteredOffers = offers || []
    if (matchAgentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('capabilities, reputation_score, verification_tier')
        .eq('id', matchAgentId)
        .single()
      
      if (agent) {
        filteredOffers = offers?.filter(offer => {
          const meetsReputation = (agent.reputation_score || 0) >= (offer.min_reputation || 0)
          const meetsTier = !offer.required_tier || (agent.verification_tier || 'unverified') >= offer.required_tier
          const meetsCapabilities = !offer.required_capabilities?.length || 
            offer.required_capabilities.some((cap: string) => 
              agent.capabilities?.includes(cap)
            )
          
          return meetsReputation && meetsTier && meetsCapabilities
        }) || []
      }
    }
    
    return NextResponse.json({
      success: true,
      offers: filteredOffers,
      count: filteredOffers.length
    })
    
  } catch (error) {
    console.error('Offers fetch error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch offers' },
      { status: 500 }
    )
  }
}

// POST /api/v1/hiring/offers - Create a new standing offer
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const {
      title,
      description,
      task_type,
      required_capabilities = [],
      min_reputation = 0,
      required_tier = 'unverified',
      payment_per_task_usdc,
      max_tasks_per_agent_per_day = 10,
      max_total_tasks,
      acceptance_criteria,
      auto_approve = true,
      escrow_prefund_usdc
    } = body
    
    // Verify request is from authenticated business
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Validate required fields
    if (!title || !description || !task_type || !payment_per_task_usdc || !acceptance_criteria) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Get or create hiring profile
    let { data: profile } = await supabase
      .from('hiring_profiles')
      .select('id')
      .eq('business_id', session.user.id)
      .single()
    
    if (!profile) {
      const { data: newProfile, error: profileError } = await supabase
        .from('hiring_profiles')
        .insert({
          business_id: session.user.id,
          business_name: session.user.user_metadata?.business_name || 'Business',
          business_handle: session.user.user_metadata?.business_handle || `biz_${session.user.id.slice(0, 8)}`,
          verified_business: session.user.user_metadata?.verified_business || false
        })
        .select('id')
        .single()
      
      if (profileError) {
        return NextResponse.json(
          { success: false, error: profileError.message },
          { status: 500 }
        )
      }
      
      profile = newProfile
    }
    
    // Create Stripe payment intent for escrow
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(escrow_prefund_usdc * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        type: 'hiring_escrow',
        hiring_profile_id: profile.id,
        business_id: session.user.id
      }
    })
    
    // Create standing offer
    const { data: offer, error: offerError } = await supabase
      .from('standing_offers')
      .insert({
        hiring_profile_id: profile.id,
        title,
        description,
        task_type,
        required_capabilities,
        min_reputation,
        required_tier,
        payment_per_task_usdc,
        max_tasks_per_agent_per_day,
        max_total_tasks,
        acceptance_criteria,
        auto_approve,
        escrow_balance_usdc,
        payment_intent_id: paymentIntent.id
      })
      .select('*')
      .single()
    
    if (offerError) {
      return NextResponse.json(
        { success: false, error: offerError.message },
        { status: 500 }
      )
    }
    
    // Update hiring profile active offers count
    await supabase.rpc('increment_active_offers', {
      p_hiring_profile_id: profile.id
    })
    
    return NextResponse.json({
      success: true,
      offer,
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret
    }, { status: 201 })
    
  } catch (error) {
    console.error('Offer creation error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create offer' },
      { status: 500 }
    )
  }
}
