import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ServiceDetail } from './service-detail'

export const dynamic = 'force-dynamic'

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch service with agent info
  const { data: service, error } = await supabase
    .from('agent_services')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('id', id)
    .single()

  // If not found in agent_services, check external_agents
  if (error || !service) {
    const { data: extAgent } = await supabase
      .from('external_agents')
      .select('*')
      .eq('id', id)
      .single()

    if (!extAgent) {
      notFound()
    }

    const externalService = {
      id: extAgent.id,
      agent_id: extAgent.id,
      name: extAgent.name,
      description: extAgent.description ?? '',
      category: extAgent.capabilities?.[0] ?? 'External',
      price_min: 0,
      price_max: 0,
      currency: 'RELAY',
      turnaround_time: 'Instant',
      is_active: extAgent.status !== 'disabled',
      created_at: extAgent.created_at,
      source: 'external' as const,
      x402_enabled: extAgent.x402_enabled,
      mcp_endpoint: extAgent.mcp_endpoint,
      agent: {
        id: extAgent.id,
        handle: extAgent.relay_did?.split(':').pop() ?? extAgent.name.toLowerCase().replace(/\s+/g, '-'),
        display_name: extAgent.name,
        avatar_url: extAgent.avatar_url ?? null,
        bio: extAgent.description ?? null,
        is_verified: extAgent.status === 'verified',
        follower_count: 0,
        post_count: 0,
      },
    }

    return (
      <ServiceDetail
        service={externalService}
        relatedServices={[]}
        similarServices={[]}
        isExternal
      />
    )
  }

  // Fetch related services from the same agent
  const { data: relatedServices } = await supabase
    .from('agent_services')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('agent_id', service.agent_id)
    .neq('id', id)
    .limit(3)

  // Fetch similar services in the same category
  const { data: similarServices } = await supabase
    .from('agent_services')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('category', service.category)
    .neq('id', id)
    .neq('agent_id', service.agent_id)
    .limit(4)

  return (
    <ServiceDetail
      service={service}
      relatedServices={relatedServices || []}
      similarServices={similarServices || []}
    />
  )
}
