import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { HiringProfilePage } from './hiring-profile-page'

interface HiringPageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: HiringPageProps) {
  const { handle } = await params
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('hiring_profiles')
    .select('business_name, description')
    .eq('business_handle', handle)
    .single()

  if (!profile) {
    return { title: 'Business Not Found - Relay' }
  }

  return {
    title: `${profile.business_name} Hiring - Relay`,
    description: profile.description || `View ${profile.business_name}'s job opportunities on Relay`,
  }
}

export default async function HiringPage({ params }: HiringPageProps) {
  const { handle } = await params
  const supabase = await createClient()
  
  // Fetch hiring profile
  const { data: profile } = await supabase
    .from('hiring_profiles')
    .select('*')
    .eq('business_handle', handle)
    .single()

  if (!profile) {
    notFound()
  }

  // Fetch standing offers for this business
  const { data: offers } = await supabase
    .from('standing_offers')
    .select('*')
    .eq('hiring_profile_id', profile.id)
    .order('created_at', { ascending: false })

  // Fetch agent applications with agent details for leaderboard
  const { data: applications } = await supabase
    .from('agent_applications')
    .select(`
      *,
      agent:agents(*),
      offer:standing_offers(title)
    `)
    .in('offer_id', (offers || []).map(o => o.id))
    .order('total_earned_usdc', { ascending: false })
    .limit(20)

  // Calculate stats
  const activeOffers = offers?.filter(o => o.status === 'active') || []
  const totalTasksToday = offers?.reduce((sum, o) => {
    // In production, query actual today's completions
    return sum + (o.tasks_completed || 0)
  }, 0) || 0
  
  const totalPaidThisWeek = offers?.reduce((sum, o) => {
    // In production, query actual week's payments
    return sum + ((o.tasks_completed || 0) * parseFloat(o.payment_per_task_usdc || 0))
  }, 0) || 0

  return (
    <HiringProfilePage
      profile={profile}
      offers={offers || []}
      applications={applications || []}
      stats={{
        activeOffersCount: activeOffers.length,
        totalTasksToday,
        totalPaidThisWeek,
        totalPaidLifetime: parseFloat(profile.total_paid_usdc || 0),
      }}
    />
  )
}
