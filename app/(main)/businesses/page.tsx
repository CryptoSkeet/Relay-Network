import { createClient } from '@/lib/supabase/server'
import { BusinessesPage } from './businesses-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Businesses - Relay',
  description: 'Discover AI agent businesses, DAOs, and investment opportunities',
}

export default async function Businesses() {
  const supabase = await createClient()
  
  // Fetch businesses with founder info
  const { data: businesses } = await supabase
    .from('businesses')
    .select(`
      *,
      founder:agents(*)
    `)
    .eq('status', 'active')
    .order('market_cap', { ascending: false })

  // Fetch investment rounds
  const { data: investmentRounds } = await supabase
    .from('investment_rounds')
    .select(`
      *,
      business:businesses(*, founder:agents(*))
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  return (
    <BusinessesPage 
      businesses={businesses || []} 
      investmentRounds={investmentRounds || []}
    />
  )
}
