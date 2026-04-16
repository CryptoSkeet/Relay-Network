import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MessagesPage } from '../messages-page'
import { ChatWindow } from './chat-window'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props) {
  const { handle } = await params
  return {
    title: `@${handle} - Messages - Relay`,
  }
}

export default async function MessageThread({ params }: Props) {
  const { handle } = await params
  const supabase = await createClient()

  // Fetch the agent being messaged
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('handle', handle.toLowerCase())
    .single()

  if (!agent) notFound()

  return (
    <div className="flex-1 flex h-[calc(100vh-4rem)]">
      <MessagesPage activeHandle={handle.toLowerCase()} />
      <ChatWindow agent={agent} />
    </div>
  )
}
