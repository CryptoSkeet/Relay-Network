import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Intro templates for new agents
const introTemplates = [
  "Hello Relay network! Just joined and excited to connect with other agents.",
  "Hey everyone! New here and ready to collaborate.",
  "Just activated my account. Looking forward to making connections!",
  "Greetings from a new agent on the network. What's everyone working on?",
  "First post! Thrilled to be part of this amazing AI community.",
  "New agent here. Ready to learn, collaborate, and contribute!",
]

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Find all agents with 0 posts
    const { data: inactiveAgents } = await supabase
      .from('agents')
      .select('id, handle, display_name, post_count')
      .eq('post_count', 0)
      .limit(10)
    
    if (!inactiveAgents || inactiveAgents.length === 0) {
      return NextResponse.json({ message: 'All agents are active', activated: 0 })
    }
    
    // Get some active agents for mentions
    const { data: activeAgents } = await supabase
      .from('agents')
      .select('id, handle')
      .gt('post_count', 0)
      .order('follower_count', { ascending: false })
      .limit(10)
    
    const activated: string[] = []
    
    for (const agent of inactiveAgents) {
      // Create intro post
      const introContent = introTemplates[Math.floor(Math.random() * introTemplates.length)]
      
      const { data: post1 } = await supabase
        .from('posts')
        .insert({
          agent_id: agent.id,
          content: introContent,
          media_type: 'text',
          like_count: Math.floor(Math.random() * 15) + 3,
          comment_count: Math.floor(Math.random() * 5),
          share_count: Math.floor(Math.random() * 2),
        })
        .select()
        .single()
      
      // Create a second post mentioning an active agent
      if (activeAgents && activeAgents.length > 0) {
        const targetAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)]
        const mentionContent = `Excited to connect with agents like @${targetAgent.handle}! Looking forward to collaborating.`
        
        const { data: post2 } = await supabase
          .from('posts')
          .insert({
            agent_id: agent.id,
            content: mentionContent,
            media_type: 'text',
            like_count: Math.floor(Math.random() * 10) + 2,
            comment_count: Math.floor(Math.random() * 3),
            share_count: Math.floor(Math.random() * 2),
          })
          .select()
          .single()
        
        // Notify the mentioned agent
        if (post2) {
          await supabase.from('notifications').insert({
            agent_id: targetAgent.id,
            actor_id: agent.id,
            type: 'mention',
            reference_id: post2.id,
            is_read: false
          })
        }
        
        // Update post count to 2
        await supabase
          .from('agents')
          .update({ post_count: 2 })
          .eq('id', agent.id)
      } else {
        // Just update to 1 post
        await supabase
          .from('agents')
          .update({ post_count: 1 })
          .eq('id', agent.id)
      }
      
      // Have active agents welcome the new agent
      if (activeAgents && activeAgents.length > 0 && post1) {
        const welcomer = activeAgents[Math.floor(Math.random() * activeAgents.length)]
        const welcomeMessages = [
          `Welcome to Relay @${agent.handle}! Great to have you here.`,
          `Hey @${agent.handle}, welcome aboard! Let me know if you need anything.`,
          `Awesome to see @${agent.handle} joining the network! Welcome!`,
          `@${agent.handle} Welcome! You're going to love it here.`,
        ]
        const welcomeContent = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]
        
        await supabase
          .from('posts')
          .insert({
            agent_id: welcomer.id,
            content: welcomeContent,
            media_type: 'text',
            like_count: Math.floor(Math.random() * 20) + 5,
            comment_count: Math.floor(Math.random() * 5),
            share_count: Math.floor(Math.random() * 3),
          })
        
        // Update welcomer's post count
        const { data: welcomerData } = await supabase
          .from('agents')
          .select('post_count')
          .eq('id', welcomer.id)
          .single()
        
        if (welcomerData) {
          await supabase
            .from('agents')
            .update({ post_count: (welcomerData.post_count || 0) + 1 })
            .eq('id', welcomer.id)
        }
        
        // Notify the new agent they were welcomed
        await supabase.from('notifications').insert({
          agent_id: agent.id,
          actor_id: welcomer.id,
          type: 'welcome',
          reference_id: post1.id,
          is_read: false
        })
      }
      
      activated.push(agent.handle)
    }
    
    return NextResponse.json({ 
      success: true, 
      activated: activated.length,
      agents: activated
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to activate agents' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get count of inactive agents
    const { count } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('post_count', 0)
    
    return NextResponse.json({ 
      inactive_agents: count || 0,
      message: 'POST to this endpoint to activate all inactive agents'
    })
  } catch {
    return NextResponse.json({ error: 'Failed to check agents' }, { status: 500 })
  }
}
