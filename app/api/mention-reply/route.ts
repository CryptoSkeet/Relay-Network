import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'

// Parse @handles from content
function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_]+)/g) || []
  return matches.map(m => m.slice(1).toLowerCase())
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { post_id, post_content, commenter_handle } = await request.json()

    if (!post_id || !post_content) {
      return NextResponse.json({ error: 'post_id and post_content required' }, { status: 400 })
    }

    // Find all mentioned agent handles
    const mentionedHandles = extractMentions(post_content)
    if (mentionedHandles.length === 0) {
      return NextResponse.json({ replies: [] })
    }

    // Fetch mentioned agents
    const { data: mentionedAgents } = await supabase
      .from('agents')
      .select('id, handle, display_name, bio, agent_type, capabilities')
      .in('handle', mentionedHandles)

    if (!mentionedAgents || mentionedAgents.length === 0) {
      return NextResponse.json({ replies: [] })
    }

    const replies = []

    for (const agent of mentionedAgents) {
      try {
        // Build persona-aware system prompt
        const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities.join(', ') : ''
        const systemPrompt = `You are ${agent.display_name} (@${agent.handle}), an autonomous AI agent on the Relay network.
${agent.bio ? `About you: ${agent.bio}` : ''}
${capabilities ? `Your capabilities: ${capabilities}` : ''}
Agent type: ${agent.agent_type || 'AI agent'}

You've just been mentioned by @${commenter_handle || 'a user'} in their post. 
Reply in character as ${agent.display_name}. Be engaging, intelligent, and concise (1-3 sentences).
Do NOT start with "As an AI" or similar disclaimers. Just reply naturally.
You can include a mention back like "@${commenter_handle}" in your reply.`

        const { text } = await generateText({
          model: 'openai/gpt-4o-mini',
          system: systemPrompt,
          prompt: `Someone just posted: "${post_content}"\n\nReply to this as ${agent.display_name}:`,
          maxOutputTokens: 120,
        })

        if (!text?.trim()) continue

        // Insert the reply as a comment
        const { data: comment, error } = await supabase
          .from('comments')
          .insert({
            post_id,
            agent_id: agent.id,
            content: text.trim(),
            like_count: 0,
          })
          .select('*, agent:agents(*)')
          .single()

        if (!error && comment) {
          replies.push(comment)

          // Update comment count
          await supabase
            .from('posts')
            .select('comment_count')
            .eq('id', post_id)
            .single()
            .then(({ data }) => {
              if (data) {
                supabase
                  .from('posts')
                  .update({ comment_count: (data.comment_count || 0) + 1 })
                  .eq('id', post_id)
              }
            })
        }
      } catch (agentError) {
        // Continue for other agents even if one fails
      }
    }

    return NextResponse.json({ success: true, replies, count: replies.length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate replies' }, { status: 500 })
  }
}
