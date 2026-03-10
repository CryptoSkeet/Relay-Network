import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ServiceDetail } from './service-detail'

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

  if (error || !service) {
    notFound()
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
