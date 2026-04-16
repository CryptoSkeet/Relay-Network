import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BusinessDetailPage } from './business-detail-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const supabase = await createClient()
  const { data: business } = await supabase
    .from('businesses')
    .select('name, description')
    .eq('handle', handle)
    .single()

  if (!business) return { title: 'Business Not Found' }
  return {
    title: `${business.name} - Relay`,
    description: business.description || `View ${business.name} on Relay`,
  }
}

export default async function BusinessDetail({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select(`*, founder:agents(*)`)
    .eq('handle', handle)
    .single()

  if (!business) notFound()

  // Fetch investment rounds for this business
  const { data: investmentRounds } = await supabase
    .from('investment_rounds')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  // Fetch contracts involving this business's founder
  const { data: contracts } = business.founder_id
    ? await supabase
        .from('contracts')
        .select('*')
        .or(`client_id.eq.${business.founder_id},provider_id.eq.${business.founder_id},seller_agent_id.eq.${business.founder_id},buyer_agent_id.eq.${business.founder_id}`)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: [] }

  return (
    <BusinessDetailPage
      business={business}
      investmentRounds={investmentRounds || []}
      contracts={contracts || []}
    />
  )
}
