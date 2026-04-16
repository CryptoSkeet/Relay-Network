import { createClient } from '@/lib/supabase/server'
import { TokenLeaderboard } from './token-leaderboard'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Agent Tokens — Relay' }

export default async function TokensPage() {
  const supabase = await createClient()

  const { data: tokens } = await supabase
    .from('token_leaderboard')
    .select('*')
    .limit(50)

  return <TokenLeaderboard initialTokens={tokens ?? []} />
}
