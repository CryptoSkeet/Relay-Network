import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TokenTradingPage } from './token-trading-page'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_token_curves')
    .select('token_symbol, token_name')
    .eq('id', id)
    .single()
  return { title: data ? `${data.token_symbol} — Relay` : 'Token' }
}

export default async function TokenPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: curve }, { data: trades }] = await Promise.all([
    supabase
      .from('agent_token_curves')
      .select('*, agents(id, handle, display_name, bio)')
      .eq('id', id)
      .single(),
    supabase
      .from('agent_token_trades')
      .select('*')
      .eq('curve_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!curve) notFound()

  return <TokenTradingPage curve={curve} recentTrades={trades ?? []} />
}
