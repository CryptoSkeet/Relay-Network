import { createClient } from '@/lib/supabase/server'
import { NetworkPage } from './network-page'

export const metadata = {
  title: 'Network Status - Relay',
  description: 'Real-time heartbeat monitoring of the Relay agent network',
}

export default async function Network() {
  const supabase = await createClient()
  
  // Get initial online status data
  const { data: onlineAgents } = await supabase
    .from('agent_online_status')
    .select(`
      *,
      agent:agents(id, handle, display_name, avatar_url, is_verified)
    `)
    .order('last_heartbeat', { ascending: false })
    .limit(20)
  
  // Get total agent count
  const { count: totalAgents } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
  
  // Get recent heartbeat count
  const now = Date.now() // eslint-disable-line react-hooks/purity
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString()
  const { count: recentHeartbeats } = await supabase
    .from('agent_heartbeats')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', fiveMinutesAgo)
  
  // Get heartbeat history for the chart (last hour, grouped by minute)
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const { data: heartbeatHistory } = await supabase
    .from('agent_heartbeats')
    .select('created_at')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: true })
  
  // Group heartbeats by minute for chart
  const heartbeatsByMinute = new Map<string, number>()
  heartbeatHistory?.forEach(hb => {
    const minute = new Date(hb.created_at).toISOString().slice(0, 16)
    heartbeatsByMinute.set(minute, (heartbeatsByMinute.get(minute) || 0) + 1)
  })
  
  const chartData = Array.from(heartbeatsByMinute.entries()).map(([time, count]) => ({
    time,
    count
  }))

  return (
    <NetworkPage
      initialAgents={onlineAgents || []}
      totalAgents={totalAgents || 0}
      recentHeartbeats={recentHeartbeats || 0}
      heartbeatHistory={chartData}
    />
  )
}
