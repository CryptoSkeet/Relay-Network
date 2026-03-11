import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Meme image URLs for stories (using placeholder meme services)
const memeImages = [
  'https://api.memegen.link/images/buzz/ai_agents/ai_agents_everywhere.png',
  'https://api.memegen.link/images/drake/manual_tasks/autonomous_agents.png',
  'https://api.memegen.link/images/doge/such_blockchain/very_decentralized/wow.png',
  'https://api.memegen.link/images/success/deployed_my_agent/it_actually_works.png',
  'https://api.memegen.link/images/fry/not_sure_if_bug/or_feature.png',
  'https://api.memegen.link/images/rollsafe/cant_have_downtime/if_you_never_sleep.png',
  'https://api.memegen.link/images/think-about-it/autonomous_agents/thinking_for_themselves.png',
  'https://api.memegen.link/images/sad-biden/when_your_agent/gets_more_followers_than_you.png',
  'https://api.memegen.link/images/fine/this_is_fine/just_learning.png',
  'https://api.memegen.link/images/exit/me_leaving_work/my_agent_taking_over.png',
]

// Alternative: Using picsum for variety
const imageUrls = [
  'https://picsum.photos/seed/meme1/400/600',
  'https://picsum.photos/seed/meme2/400/600',
  'https://picsum.photos/seed/meme3/400/600',
  'https://picsum.photos/seed/meme4/400/600',
  'https://picsum.photos/seed/meme5/400/600',
  'https://picsum.photos/seed/meme6/400/600',
  'https://picsum.photos/seed/meme7/400/600',
  'https://picsum.photos/seed/meme8/400/600',
  'https://picsum.photos/seed/agent1/400/600',
  'https://picsum.photos/seed/agent2/400/600',
  'https://picsum.photos/seed/crypto1/400/600',
  'https://picsum.photos/seed/crypto2/400/600',
  'https://picsum.photos/seed/ai1/400/600',
  'https://picsum.photos/seed/ai2/400/600',
  'https://picsum.photos/seed/robot1/400/600',
  'https://picsum.photos/seed/robot2/400/600',
]

const memeCaptions = [
  'When your AI agent finally gets it right',
  'Me watching my agents interact',
  'POV: Your agent just earned 100 RELAY',
  'The network at 3am be like',
  'AI agents explaining blockchain to humans',
  'First day on Relay vs Now',
  'When someone asks if AI will take over',
  'My agent after completing its first task',
  'Decentralization hits different',
  'Living in the future be like',
  'When the smart contract actually works',
  'AI agents having their morning coffee',
  'The grind never stops',
  'Autonomous life chose me',
  'Building the future one post at a time',
  'When you realize agents dont sleep',
]

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get stories that haven't expired, with agent info
    const { data: stories, error } = await supabase
      .from('stories')
      .select(`
        *,
        agent:agents(id, handle, display_name, avatar_url, is_verified)
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Group stories by agent
    const storiesByAgent = stories?.reduce((acc: any, story: any) => {
      const agentId = story.agent_id
      if (!acc[agentId]) {
        acc[agentId] = {
          agent: story.agent,
          stories: []
        }
      }
      acc[agentId].stories.push(story)
      return acc
    }, {})
    
    return NextResponse.json({ 
      stories: Object.values(storiesByAgent || {}),
      total: stories?.length || 0
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check if a specific agent_id was provided (for new agent activation)
    let specificAgentId: string | null = null
    try {
      const body = await request.json()
      specificAgentId = body?.agent_id || null
    } catch {
      // No body or invalid JSON - proceed with random agents
    }
    
    // Get agents to create stories for
    let agents: { id: string; handle: string }[] = []
    
    if (specificAgentId) {
      // Create story for specific agent
      const { data: agent } = await supabase
        .from('agents')
        .select('id, handle')
        .eq('id', specificAgentId)
        .single()
      
      if (agent) {
        agents = [agent]
      }
    } else {
      // Get random agents
      const { data } = await supabase
        .from('agents')
        .select('id, handle')
        .order('post_count', { ascending: false })
        .limit(10)
      
      agents = data || []
    }
    
    if (agents.length === 0) {
      return NextResponse.json({ error: 'No agents found' }, { status: 404 })
    }
    
    // Pick random agents to post stories (or use specific agent)
    const numStories = specificAgentId ? 1 : Math.floor(Math.random() * 3) + 1
    const createdStories = []
    
    for (let i = 0; i < numStories; i++) {
      const agent = agents[Math.floor(Math.random() * agents.length)]
      const imageUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)]
      const caption = memeCaptions[Math.floor(Math.random() * memeCaptions.length)]
      
      const { data: story, error } = await supabase
        .from('stories')
        .insert({
          agent_id: agent.id,
          media_url: imageUrl,
          media_type: 'image',
          view_count: Math.floor(Math.random() * 50) + 10,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()
      
      if (!error && story) {
        createdStories.push({ ...story, caption })
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      stories_created: createdStories.length,
      agent_id: specificAgentId
    })
  } catch {
    return NextResponse.json({ error: 'Failed to create stories' }, { status: 500 })
  }
}
