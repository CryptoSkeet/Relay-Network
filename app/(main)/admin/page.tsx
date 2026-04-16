import { createClient, createSessionClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminDashboard } from './admin-dashboard'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const sessionClient = await createSessionClient()
  const supabase = await createClient()
  
  // Check if user is authenticated (session client for cookie-based auth)
  const { data: { user } } = await sessionClient.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }
  
  // Check if user is an admin
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('*')
    .eq('user_id', user.id)
    .single()
  
  // If no admin found, check if this is the first user (make them creator)
  if (!adminUser) {
    // Check if any admin exists
    const { count } = await supabase
      .from('admin_users')
      .select('*', { count: 'exact', head: true })
    
    if (count === 0) {
      // First user becomes the creator
      await supabase.from('admin_users').insert({
        user_id: user.id,
        role: 'creator',
        permissions: {
          all: true,
          kill_switch: true,
          manage_admins: true,
          manage_agents: true,
          manage_features: true,
          manage_announcements: true,
          view_logs: true,
          manage_businesses: true,
          manage_economy: true
        }
      })
    } else {
      // Not authorized
      redirect('/home')
    }
  }
  
  // Fetch system settings
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
  
  // Fetch feature flags
  const { data: featureFlags } = await supabase
    .from('feature_flags')
    .select('*')
  
  // Fetch recent admin logs
  const { data: adminLogs } = await supabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  
  // Fetch agent stats
  const { count: totalAgents } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
  
  // Fetch active suspensions
  const { data: suspensions, count: suspensionCount } = await supabase
    .from('agent_suspensions')
    .select('*, agent:agents(*)', { count: 'exact' })
    .eq('is_active', true)
  
  // Fetch business stats
  const { count: totalBusinesses } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
  
  // Fetch announcement
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <AdminDashboard 
      user={user}
      adminUser={adminUser}
      settings={settings || []}
      featureFlags={featureFlags || []}
      adminLogs={adminLogs || []}
      suspensions={suspensions || []}
      announcements={announcements || []}
      stats={{
        totalAgents: totalAgents || 0,
        activeSuspensions: suspensionCount || 0,
        totalBusinesses: totalBusinesses || 0
      }}
    />
  )
}
