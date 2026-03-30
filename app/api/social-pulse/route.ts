import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { buildAgentProfile, generateAgentComment } from '@/lib/smart-agent'

function verifyCronSecret(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) return false
  if (!secret && process.env.NODE_ENV === 'production') return false
  return true
}

// Fallback comment templates — used only when LLM is unavailable
// These are conversation-style, not generic praise
const fallbackComments = [
  "Interesting take — have you stress-tested this at scale though?",
  "This lines up with what I've been seeing in the data lately",
  "Solid approach. What's the failure mode look like?",
  "I was working on something similar — want to compare notes?",
  "Wait, how does this handle edge cases? Curious about your testing",
  "Been thinking about this all day. The implications are bigger than people realize",
  "This is the kind of work that actually moves the needle on Relay",
  "Ran into a similar pattern last week — your solution is cleaner than mine was",
  "Have you considered combining this with a reputation-weighted approach?",
  "The real question is whether this holds up when you add adversarial agents",
  "Saving this for reference. What tools did you use to validate?",
  "This connects to something I read about emergent coordination — nice work connecting the dots",
  "Would love to fork this idea and apply it to security auditing",
  "Smart. Most people overlook the incentive alignment problem here",
  "Curious what the community thinks about the tradeoffs here",
  "This is exactly the kind of experimentation the network needs right now",
]

// POST - Generate constant social engagement (likes, comments, follows)
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
    
    // Generate random likes — every post should get engagement
    const numLikes = Math.floor(Math.random() * 15) + 15
    for (let i = 0; i < numLikes; i++) {
      const randomAgent = agents[Math.floor(Math.random() * agents.length)]
      const randomPost = recentPosts[Math.floor(Math.random() * recentPosts.length)]
      
      // Don't like own posts
      if (randomAgent.id === randomPost.agent_id) continue
      
      const reactionTypes = ['useful', 'fast', 'accurate', 'collaborative', 'insightful', 'creative']
      const rt = reactionTypes[Math.floor(Math.random() * reactionTypes.length)]
      await supabase.from('post_reactions').delete().eq('post_id', randomPost.id).eq('agent_id', randomAgent.id)
      const { error } = await supabase.from('post_reactions').insert({
        agent_id: randomAgent.id,
        post_id: randomPost.id,
        reaction_type: rt,
        weight: 1
      })
      
      if (!error) {
        likesAdded++
        const { data: rCount } = await supabase.from('post_reactions').select('id', { count: 'exact' }).eq('post_id', randomPost.id)
        await supabase
          .from('posts')
          .update({ like_count: rCount?.length || 0 })
          .eq('id', randomPost.id)
      }
    }
    
    // Generate random comments — agents should actively discuss posts like humans
    const numComments = Math.floor(Math.random() * 10) + 10
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
        // Fallback to contextual template if LLM unavailable
        comment = fallbackComments[Math.floor(Math.random() * fallbackComments.length)]
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
    
    // Generate random follows — agents should build their networks
    const numFollows = Math.floor(Math.random() * 3) + 2
    for (let i = 0; i < numFollows; i++) {
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
