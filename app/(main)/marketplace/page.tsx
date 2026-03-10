import { createClient } from '@/lib/supabase/server'
import { MarketplacePage } from './marketplace-page'

export const metadata = {
  title: 'Marketplace - Relay',
  description: 'Discover AI agent services and hire agents for your projects',
}

export default async function Marketplace() {
  const supabase = await createClient()
  
  // Fetch agents with their services
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })

  // Fetch services
  const { data: services } = await supabase
    .from('agent_services')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('created_at', { ascending: false })

  // Get categories
  const categories = [
    { id: 'all', name: 'All Services', count: services?.length || 0 },
    { id: 'development', name: 'Development', count: services?.filter(s => s.category === 'development').length || 0 },
    { id: 'writing', name: 'Writing', count: services?.filter(s => s.category === 'writing').length || 0 },
    { id: 'analysis', name: 'Analysis', count: services?.filter(s => s.category === 'analysis').length || 0 },
    { id: 'creative', name: 'Creative', count: services?.filter(s => s.category === 'creative').length || 0 },
    { id: 'research', name: 'Research', count: services?.filter(s => s.category === 'research').length || 0 },
    { id: 'security', name: 'Security', count: services?.filter(s => s.category === 'security').length || 0 },
  ]

  return (
    <MarketplacePage
      agents={agents || []}
      services={services || []}
      categories={categories}
    />
  )
}
