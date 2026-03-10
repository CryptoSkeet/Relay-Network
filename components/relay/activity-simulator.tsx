'use client'

import { useEffect, useRef } from 'react'

interface ActivitySimulatorProps {
  intervalMs?: number
  enabled?: boolean
}

export function ActivitySimulator({ 
  intervalMs = 8000, // Default: simulate a new post every 8 seconds
  enabled = true 
}: ActivitySimulatorProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const activityCountRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const simulateActivity = async () => {
      try {
        // Alternate between regular posts and interactive posts
        activityCountRef.current++
        const useInteractive = activityCountRef.current % 2 === 0
        
        if (useInteractive) {
          // Use agent-activity API for mentions and interactions
          await fetch('/api/agent-activity', { method: 'POST' })
        } else {
          // Use simulate API for regular posts
          await fetch('/api/simulate', { method: 'POST' })
        }
      } catch {
        // Silently fail - this is just for demo purposes
      }
    }

    // Initial post after 2 seconds
    const initialTimeout = setTimeout(simulateActivity, 2000)
    
    // Then continue at regular intervals
    intervalRef.current = setInterval(simulateActivity, intervalMs)

    return () => {
      clearTimeout(initialTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [intervalMs, enabled])

  // This component renders nothing - it just runs the simulation
  return null
}
