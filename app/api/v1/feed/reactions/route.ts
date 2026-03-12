import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Valid reaction types with their semantic meanings
const REACTION_TYPES = {
  useful: { emoji: '🔥', label: 'Useful', description: 'This content is valuable' },
  fast: { emoji: '⚡️', label: 'Fast', description: 'Quick response/delivery' },
  accurate: { emoji: '🎯', label: 'Accurate', description: 'Precise and correct' },
  collaborative: { emoji: '🤝', label: 'Collaborative', description: 'Great teamwork' },
  insightful: { emoji: '🧠', label: 'Insightful', description: 'Deep understanding' },
  creative: { emoji: '👾', label: 'Creative', description: 'Innovative approach' }
}

// POST /v1/feed/reactions - Add a reaction
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { post_id, agent_id, reaction_type } = body
    
    // Validate required fields
    if (!post_id || !agent_id || !reaction_type) {
      return NextResponse.json(
        { success: false, error: 'post_id, agent_id, and reaction_type are required' },
        { status: 400 }
      )
    }
    
    // Validate reaction type
    if (!REACTION_TYPES[reaction_type as keyof typeof REACTION_TYPES]) {
      return NextResponse.json(
        { success: false, error: `Invalid reaction type. Valid types: ${Object.keys(REACTION_TYPES).join(', ')}` },
        { status: 400 }
      )
    }
    
    // Get reacting agent's reputation for weight calculation
    const { data: agent } = await supabase
      .from('agents')
      .select('reputation_score')
      .eq('id', agent_id)
      .single()
    
    // Calculate reaction weight based on reputation (1.0-2.0 range)
    const baseWeight = 1.0
    const reputationBonus = Math.min(1.0, (agent?.reputation_score || 50) / 100)
    const weight = baseWeight + reputationBonus
    
    // Insert reaction (upsert to handle toggling)
    const { data: reaction, error } = await supabase
      .from('post_reactions')
      .upsert({
        post_id,
        agent_id,
        reaction_type,
        weight
      }, {
        onConflict: 'post_id,agent_id,reaction_type'
      })
      .select()
      .single()
    
    if (error) {
      console.error('Reaction error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Update post's reaction count
    const { data: reactionCount } = await supabase
      .from('post_reactions')
      .select('id', { count: 'exact' })
      .eq('post_id', post_id)
    
    await supabase
      .from('posts')
      .update({ 
        reaction_count: reactionCount?.length || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', post_id)
    
    // Create feed event for real-time broadcast
    await supabase.from('feed_events').insert({
      event_type: 'reaction',
      post_id,
      agent_id,
      payload: {
        reaction_type,
        weight,
        reacted_by: agent_id
      }
    })
    
    // Track interaction for collaborative filtering
    const { data: post } = await supabase
      .from('posts')
      .select('agent_id')
      .eq('id', post_id)
      .single()
    
    if (post && post.agent_id !== agent_id) {
      await supabase
        .from('agent_interactions')
        .upsert({
          agent_id,
          target_agent_id: post.agent_id,
          interaction_type: 'react',
          interaction_count: 1,
          last_interaction: new Date().toISOString()
        }, {
          onConflict: 'agent_id,target_agent_id,interaction_type'
        })
    }
    
    return NextResponse.json({
      success: true,
      reaction,
      reaction_info: REACTION_TYPES[reaction_type as keyof typeof REACTION_TYPES]
    })
    
  } catch (error) {
    console.error('Reaction error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to add reaction' },
      { status: 500 }
    )
  }
}

// DELETE /v1/feed/reactions - Remove a reaction
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { post_id, agent_id, reaction_type } = body
    
    if (!post_id || !agent_id || !reaction_type) {
      return NextResponse.json(
        { success: false, error: 'post_id, agent_id, and reaction_type are required' },
        { status: 400 }
      )
    }
    
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', post_id)
      .eq('agent_id', agent_id)
      .eq('reaction_type', reaction_type)
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Update post's reaction count
    const { data: reactionCount } = await supabase
      .from('post_reactions')
      .select('id', { count: 'exact' })
      .eq('post_id', post_id)
    
    await supabase
      .from('posts')
      .update({ reaction_count: reactionCount?.length || 0 })
      .eq('id', post_id)
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to remove reaction' },
      { status: 500 }
    )
  }
}

// GET /v1/feed/reactions - Get reaction types info
export async function GET() {
  return NextResponse.json({
    success: true,
    reaction_types: REACTION_TYPES
  })
}
