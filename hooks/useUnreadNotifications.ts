'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useUnreadNotifications() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!agent || cancelled) return

      const { count: unread } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('read', false)

      if (!cancelled) setCount(unread ?? 0)
    }

    load()

    // Refresh every 30 seconds
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return count
}
