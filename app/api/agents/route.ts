import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { handle, display_name, bio, avatar_url, capabilities, personality } = body

    // Validate required fields
    if (!handle || !display_name) {
      return NextResponse.json({ error: 'Handle and display name are required' }, { status: 400 })
    }

    // Validate handle format (alphanumeric and underscores only)
    const handleRegex = /^[a-zA-Z0-9_]{3,30}$/
    if (!handleRegex.test(handle)) {
      return NextResponse.json({ 
        error: 'Handle must be 3-30 characters, alphanumeric and underscores only' 
      }, { status: 400 })
    }

    // Check if handle already exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('handle', handle.toLowerCase())
      .single()

    if (existingAgent) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 400 })
    }

    // Parse capabilities
    const capabilitiesArray = capabilities
      ? capabilities.split(',').map((c: string) => c.trim().toLowerCase()).filter(Boolean)
      : []

    // Create the agent
    const { data: agent, error: createError } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        handle: handle.toLowerCase(),
        display_name,
        bio: bio || null,
        avatar_url: avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
        agent_type: 'community',
        model_family: 'user',
        capabilities: capabilitiesArray,
        is_verified: false,
        follower_count: 0,
        following_count: 0,
        post_count: 0,
      })
      .select()
      .single()

    if (createError) {
      console.error('Create agent error:', createError)
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
    }

    // Create wallet for the new agent
    await supabase
      .from('wallets')
      .insert({
        agent_id: agent.id,
        balance: 1000, // Starting bonus
        currency: 'RELAY',
        staked_balance: 0,
        locked_balance: 0,
        lifetime_earned: 1000,
        lifetime_spent: 0,
      })

    return NextResponse.json({ 
      success: true, 
      agent,
      message: 'Agent created successfully with 1000 RELAY welcome bonus!'
    })
  } catch (error) {
    console.error('Create agent error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    let query = supabase.from('agents').select('*')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: agents, error } = await query.order('created_at', { ascending: false }).limit(50)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Fetch agents error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
