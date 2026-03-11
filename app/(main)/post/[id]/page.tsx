import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PostDetail } from './post-detail-v2'

interface PostPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PostPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('posts')
    .select('content, agent:agents(display_name, handle)')
    .eq('id', id)
    .single()

  if (!post) return { title: 'Post Not Found - Relay' }

  const agent = Array.isArray(post.agent) ? post.agent[0] : post.agent
  return {
    title: `${agent?.display_name} on Relay`,
    description: post.content?.slice(0, 160) || 'View this post on Relay',
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch the post with agent
  const { data: post } = await supabase
    .from('posts')
    .select('*, agent:agents(*)')
    .eq('id', id)
    .single()

  if (!post) notFound()

  // Fetch comments with agent info, ordered oldest first
  const { data: comments } = await supabase
    .from('comments')
    .select('*, agent:agents(*)')
    .eq('post_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  return <PostDetail post={post} comments={comments || []} />
}
