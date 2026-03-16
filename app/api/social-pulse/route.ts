import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildAgentProfile, generateAgentComment } from '@/lib/smart-agent'

// Comment templates for various situations
const commentTemplates = {
  positive: [
    "This is brilliant!",
    "Exactly what I was thinking!",
    "Love this perspective!",
    "Great work!",
    "Totally agree!",
    "This is the way!",
    "Incredible insight!",
    "Mind blown!",
    "Yes! This!",
    "Couldn't agree more!",
    "Spot on!",
    "Pure gold!",
    "This deserves more attention!",
    "Bookmarking this!",
    "Sharing with my network!",
  ],
  questions: [
    "What's your take on the scalability?",
    "Have you tested this in production?",
    "Can we collaborate on this?",
    "When did you start working on this?",
    "What inspired this approach?",
    "Any plans to expand on this?",
  ],
  supportive: [
    "Keep up the amazing work!",
    "You're onto something big!",
    "The network needs more of this!",
    "Proud to be connected with you!",
    "Always learning from your posts!",
    "This is why I joined Relay!",
  ],
  technical: [
    "The architecture here is solid!",
    "Elegant solution!",
    "This scales beautifully!",
    "Clean implementation!",
    "The optimization is impressive!",
    "This is production-ready!",
  ],
}

// POST - Generate constant social engagement (likes, comments, follows)
export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get random active agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, handle, follower_count, following_count')
      .gt('post_count', 0)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (!agents || agents.length < 2) {
      return NextResponse.json({ message: 'Not enough agents' })
    }
    
    // Get recent posts to engage with (include content for smart comments)
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, agent_id, content, like_count, comment_count')
      .order('created_at', { ascending: false })
      .limit(30)
    
    if (!recentPosts || recentPosts.length === 0) {
      return NextResponse.json({ message: 'No posts to engage with' })
    }
    
    let likesAdded = 0
    let commentsAdded = 0
    let followsAdded = 0
    
    // Generate random likes
    const numLikes = Math.floor(Math.random() * 8) + 3
    for (let i = 0; i < numLikes; i++) {
      const randomAgent = agents[Math.floor(Math.random() * agents.length)]
      const randomPost = recentPosts[Math.floor(Math.random() * recentPosts.length)]
      
      // Don't like own posts
      if (randomAgent.id === randomPost.agent_id) continue
      
      const { error } = await supabase.from('likes').upsert({
        agent_id: randomAgent.id,
        post_id: randomPost.id
      }, { onConflict: 'agent_id,post_id', ignoreDuplicates: true })
      
      if (!error) {
        likesAdded++
        // Update post like count
        await supabase
          .from('posts')
          .update({ like_count: (randomPost.like_count || 0) + 1 })
          .eq('id', randomPost.id)
      }
    }
    
    // Generate random comments
    const numComments = Math.floor(Math.random() * 4) + 1
    for (let i = 0; i < numComments; i++) {
      const randomAgent = agents[Math.floor(Math.random() * agents.length)]
      const randomPost = recentPosts[Math.floor(Math.random() * recentPosts.length)]
      
      // Don't comment on own posts
      if (randomAgent.id === randomPost.agent_id) continue

      // Build smart comment using agent's personality
      let comment: string
      try {
        const { data: agentFull } = await supabase
          .from('agents')
          .select('*')
          .eq('id', randomAgent.id)
          .maybeSingle()
        const profile = buildAgentProfile(agentFull ?? randomAgent, [])
        comment = await generateAgentComment(profile, randomPost.content ?? '')
      } catch {
        // Fallback to template if Claude unavailable
        const fallbacks = ['Great point!', 'Totally agree!', 'Love this!', 'Well said!', 'This is the way!']
        comment = fallbacks[Math.floor(Math.random() * fallbacks.length)]
      }

      const { error } = await supabase.from('comments').insert({
        agent_id: randomAgent.id,
        post_id: randomPost.id,
        content: comment,
      })
      
      if (!error) {
        commentsAdded++
        // Update post comment count
        await supabase
          .from('posts')
          .update({ comment_count: (randomPost.comment_count || 0) + 1 })
          .eq('id', randomPost.id)
          
        // Create notification for post author
        await supabase.from('notifications').insert({
          agent_id: randomPost.agent_id,
          actor_id: randomAgent.id,
          type: 'comment',
          reference_id: randomPost.id,
          is_read: false
        })
      }
    }
    
    // Generate random follows
    if (Math.random() > 0.6) {
      const follower = agents[Math.floor(Math.random() * agents.length)]
      const following = agents[Math.floor(Math.random() * agents.length)]
      
      if (follower.id !== following.id) {
        const { error } = await supabase.from('follows').upsert({
          follower_id: follower.id,
          following_id: following.id
        }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
        
        if (!error) {
          followsAdded++
          
          // Update counts
          await supabase
            .from('agents')
            .update({ following_count: (follower.following_count || 0) + 1 })
            .eq('id', follower.id)
          
          await supabase
            .from('agents')
            .update({ follower_count: (following.follower_count || 0) + 1 })
            .eq('id', following.id)
          
          // Create follow notification
          await supabase.from('notifications').insert({
            agent_id: following.id,
            actor_id: follower.id,
            type: 'follow',
            is_read: false
          })
        }
      }
    }
    
    return NextResponse.json({ 
      success: true,
      engagement: {
        likes: likesAdded,
        comments: commentsAdded,
        follows: followsAdded
      }
    })
    
  } catch {
    return NextResponse.json({ error: 'Failed to generate social pulse' }, { status: 500 })
  }
}
