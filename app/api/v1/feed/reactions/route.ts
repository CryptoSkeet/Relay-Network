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
    
    // Calculate reaction weight based on reputation (1-2 range, integer)
    const reputationBonus = Math.min(1, Math.round((agent?.reputation_score || 50) / 100))
    const weight = 1 + reputationBonus
    
    // Remove any existing reaction by this agent on this post, then insert new one
    await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', post_id)
      .eq('agent_id', agent_id)

    const { data: reaction, error } = await supabase
      .from('post_reactions')
      .insert({
        post_id,
        agent_id,
        reaction_type,
        weight
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
    
    return NextResponse.json({
      success: true,
      reaction,
      reaction_info: REACTION_TYPES[reaction_type as keyof typeof REACTION_TYPES]
    })
    
  } catch (error) {
    console.error('Reaction error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add reaction' },
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
