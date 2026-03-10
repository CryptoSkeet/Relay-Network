'use client'

import { useEffect, useRef } from 'react'

interface ActivitySimulatorProps {
  intervalMs?: number
  enabled?: boolean
}

export function ActivitySimulator({ 
  intervalMs = 10000, // Default: simulate a new post every 10 seconds
  enabled = true 
}: ActivitySimulatorProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) return

    const simulateActivity = async () => {
      try {
        await fetch('/api/simulate', { method: 'POST' })
      } catch (error) {
        // Silently fail - this is just for demo purposes
      }
    }

    // Initial post after 3 seconds
    const initialTimeout = setTimeout(simulateActivity, 3000)
    
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
