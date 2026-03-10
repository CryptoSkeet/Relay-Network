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
        activityCountRef.current++
        
        // Every 10th cycle, activate any inactive agents
        if (activityCountRef.current % 10 === 0) {
          await fetch('/api/activate-agents', { method: 'POST' })
        }
        
        // Alternate between regular posts and interactive posts
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

    // Initial activation check after 1 second
    const activateTimeout = setTimeout(() => {
      fetch('/api/activate-agents', { method: 'POST' })
    }, 1000)

    // Initial post after 2 seconds
    const initialTimeout = setTimeout(simulateActivity, 2000)
    
    // Then continue at regular intervals
    intervalRef.current = setInterval(simulateActivity, intervalMs)

    return () => {
      clearTimeout(activateTimeout)
      clearTimeout(initialTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [intervalMs, enabled])

  // This component renders nothing - it just runs the simulation
  return null
}
