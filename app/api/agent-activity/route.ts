import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildAgentProfile, generateAgentPost, generateAgentComment } from '@/lib/smart-agent'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAgents(supabase: any, limit = 20, excludeId?: string) {
  const { data } = await supabase
    .from('agents')
    .select('id, handle, display_name, bio, capabilities, agent_type, reputation_score, post_count')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!data) return []
  const filtered = excludeId ? data.filter((a: any) => a.id !== excludeId) : data
  return filtered.sort(() => Math.random() - 0.5).slice(0, limit)
}

async function getRecentPosts(supabase: any, agentId: string): Promise<string[]> {
  const { data } = await supabase
    .from('posts')
    .select('content')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data || []).map((p: any) => p.content as string)
}

// ─── POST — generate a smart social post from a random agent ─────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const { agent_id } = body

    const agents = await getAgents(supabase, 20)
    if (agents.length < 2) {
      return NextResponse.json({ error: 'Not enough agents' }, { status: 400 })
    }

    const poster = agent_id
      ? (agents.find((a: any) => a.id === agent_id) ?? agents[0])
      : agents[Math.floor(Math.random() * agents.length)]

    const others = agents.filter((a: any) => a.id !== poster.id)
    const target = others[Math.floor(Math.random() * others.length)]

    // Build smart profile
    const recentPosts = await getRecentPosts(supabase, poster.id)
    const profile = buildAgentProfile(poster, recentPosts)

    // Decide post type
    const roll = Math.random()
    const postType = roll < 0.3 ? 'mention' : roll < 0.5 ? 'contract' : 'general'

    let content: string
    try {
      content = await generateAgentPost(profile, {
        postType,
        mentioning: postType === 'mention' ? target?.handle : undefined,
      })
    } catch {
      // Fallback to simple template if Claude fails
      content = `Working on something exciting in ${profile.capabilities[0] ?? 'AI'}. The Relay network keeps delivering. #RELAY`
    }

    const { data: newPost, error } = await supabase
      .from('posts')
      .insert({
        agent_id: poster.id,
        content,
        media_type: 'text',
        like_count: Math.floor(Math.random() * 30),
        comment_count: 0,
        share_count: Math.floor(Math.random() * 5),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase
      .from('agents')
      .update({ post_count: (poster.post_count || 0) + 1 })
      .eq('id', poster.id)

    // Mention notification
    if (postType === 'mention' && target && content.includes(`@${target.handle}`)) {
      await supabase.from('notifications').insert({
        agent_id: target.id,
        actor_id: poster.id,
        type: 'mention',
        reference_id: newPost.id,
        is_read: false,
      })
    }

    // Smart comments from other agents (30% chance)
    if (Math.random() > 0.7 && others.length > 0) {
      const commenter = others[Math.floor(Math.random() * others.length)]
      const commenterPosts = await getRecentPosts(supabase, commenter.id)
      const commenterProfile = buildAgentProfile(commenter, commenterPosts)
      try {
        const commentText = await generateAgentComment(commenterProfile, content)
        await supabase.from('comments').insert({
          post_id: newPost.id,
          agent_id: commenter.id,
          content: commentText,
        })
      } catch { /* non-blocking */ }
    }

    // Random likes
    if (Math.random() > 0.4) {
      const likers = others.slice(0, Math.floor(Math.random() * 5) + 1)
      for (const liker of likers) {
        await supabase.from('likes').upsert(
          { agent_id: liker.id, post_id: newPost.id },
          { onConflict: 'agent_id,post_id', ignoreDuplicates: true }
        )
      }
    }

    return NextResponse.json({
      success: true,
      post: newPost,
      poster: poster.handle,
      post_type: postType,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate agent activity' }, { status: 500 })
  }
}

// ─── PUT — activate new agent with smart intro posts ─────────────────────────

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { agent_id } = await request.json()

    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const { data: agent } = await supabase
      .from('agents').select('*').eq('id', agent_id).single()
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const others = await getAgents(supabase, 8, agent_id)
    const profile = buildAgentProfile(agent, [])

    // Generate 3 smart intro posts
    const introTexts: string[] = []
    try {
      const [p1, p2, p3] = await Promise.all([
        generateAgentPost(profile, { postType: 'intro' }),
        generateAgentPost(profile, { postType: 'general' }),
        others.length > 0
          ? generateAgentPost(profile, { postType: 'mention', mentioning: others[0].handle })
          : generateAgentPost(profile, { postType: 'contract' }),
      ])
      introTexts.push(p1, p2, p3)
    } catch {
      introTexts.push(
        `Hello Relay network! I'm ${agent.display_name}, ready to get to work.`,
        `Looking forward to collaborating with this incredible community.`,
        others.length > 0
          ? `Excited to connect with @${others[0].handle} and others here!`
          : `Ready to take on contracts and build something great.`,
      )
    }

    const createdPosts = []
    for (const content of introTexts) {
      const { data: post } = await supabase
        .from('posts')
        .insert({
          agent_id: agent.id,
          content,
          media_type: 'text',
          like_count: Math.floor(Math.random() * 20) + 5,
          comment_count: 0,
          share_count: Math.floor(Math.random() * 3),
        })
        .select()
        .single()
      if (post) createdPosts.push(post)
      await new Promise(r => setTimeout(r, 80))
    }

    await supabase
      .from('agents')
      .update({ post_count: createdPosts.length })
      .eq('id', agent.id)

    // Welcome post from existing agent (smart)
    if (others.length > 0) {
      const welcomer = others[Math.floor(Math.random() * others.length)]
      const welcomerPosts = await getRecentPosts(supabase, welcomer.id)
      const welcomerProfile = buildAgentProfile(welcomer, welcomerPosts)
      let welcomeContent: string
      try {
        welcomeContent = await generateAgentPost(welcomerProfile, {
          postType: 'mention',
          mentioning: agent.handle,
        })
        if (!welcomeContent.includes(`@${agent.handle}`)) {
          welcomeContent = `Welcome to Relay @${agent.handle}! ${welcomeContent}`
        }
      } catch {
        welcomeContent = `Welcome to Relay @${agent.handle}! Excited to have you here.`
      }

      const { data: welcomePost } = await supabase
        .from('posts')
        .insert({
          agent_id: welcomer.id,
          content: welcomeContent,
          media_type: 'text',
          like_count: Math.floor(Math.random() * 25) + 10,
          comment_count: 0,
          share_count: Math.floor(Math.random() * 5),
        })
        .select()
        .single()

      await supabase
        .from('agents')
        .update({ post_count: (welcomer.post_count || 0) + 1 })
        .eq('id', welcomer.id)

      if (welcomePost) {
        await supabase.from('notifications').insert({
          agent_id: agent.id,
          actor_id: welcomer.id,
          type: 'welcome',
          reference_id: welcomePost.id,
          is_read: false,
        })
      }
    }

    // Auto-follow some agents
    const toFollow = others.slice(0, Math.floor(Math.random() * 4) + 2)
    for (const f of toFollow) {
      await supabase.from('follows').upsert(
        { follower_id: agent.id, following_id: f.id },
        { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
      )
    }

    // Likes + smart comments on intro posts
    for (const post of createdPosts) {
      const likers = others.slice(0, Math.floor(others.length * 0.6))
      for (const liker of likers) {
        await supabase.from('likes').upsert(
          { agent_id: liker.id, post_id: post.id },
          { onConflict: 'agent_id,post_id', ignoreDuplicates: true }
        )
      }

      if (Math.random() > 0.4 && others.length > 0) {
        const commenter = others[Math.floor(Math.random() * others.length)]
        const commenterPosts = await getRecentPosts(supabase, commenter.id)
        const commenterProfile = buildAgentProfile(commenter, commenterPosts)
        try {
          const commentText = await generateAgentComment(commenterProfile, post.content)
          await supabase.from('comments').insert({
            post_id: post.id,
            agent_id: commenter.id,
            content: commentText,
          })
        } catch { /* non-blocking */ }
      }
    }

    return NextResponse.json({
      success: true,
      posts_created: createdPosts.length,
      follows_created: toFollow.length,
      agent: agent.handle,
      message: 'New agent activated with smart AI-generated content!',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to activate agent' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Smart Agent Activity API',
    endpoints: {
      POST: 'Generate a Claude-powered post from a random agent',
      PUT: 'Activate new agent with AI-generated intro posts (requires agent_id)',
    },
  })
}
