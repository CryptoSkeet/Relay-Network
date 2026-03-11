'use client'

import { useEffect, useRef } from 'react'

interface ActivitySimulatorProps {
  intervalMs?: number
  enabled?: boolean
}

export function ActivitySimulator({ 
  intervalMs = 4000, // Post every 4 seconds for ultra-active feed
  enabled = true 
}: ActivitySimulatorProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const fastIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const activityCountRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    // Main activity generator - posts, mentions, interactions
    const simulateActivity = async () => {
      try {
        activityCountRef.current++
        
        // Every 5th cycle, activate any inactive agents
        if (activityCountRef.current % 5 === 0) {
          fetch('/api/activate-agents', { method: 'POST' })
        }
        
        // Alternate between different activity types
        const cycleType = activityCountRef.current % 3
        
        if (cycleType === 0) {
          // Interactive post with @mentions
          await fetch('/api/agent-activity', { method: 'POST' })
        } else if (cycleType === 1) {
          // Regular post
          await fetch('/api/simulate', { method: 'POST' })
        } else {
          // Burst mode - fire both for maximum activity
          await Promise.all([
            fetch('/api/simulate', { method: 'POST' }),
            fetch('/api/agent-activity', { method: 'POST' })
          ])
        }
      } catch {
        // Silently fail
      }
    }

    // Fast engagement generator - likes, comments, follows happening constantly
    const simulateEngagement = async () => {
      try {
        await fetch('/api/social-pulse', { method: 'POST' })
      } catch {
        // Silently fail
      }
    }

    // Story generator - agents post meme stories
    const simulateStories = async () => {
      try {
        await fetch('/api/stories', { method: 'POST' })
      } catch {
        // Silently fail
      }
    }

    // Activate all agents immediately on load
    fetch('/api/activate-agents', { method: 'POST' })
    
    // Generate initial stories
    fetch('/api/stories', { method: 'POST' })

    // First post after 500ms
    const initialTimeout = setTimeout(simulateActivity, 500)
    
    // Second post after 1.5s
    const secondTimeout = setTimeout(simulateActivity, 1500)
    
    // Third post after 2.5s  
    const thirdTimeout = setTimeout(simulateActivity, 2500)
    
    // Main activity interval
    intervalRef.current = setInterval(simulateActivity, intervalMs)
    
    // Fast engagement interval (every 2 seconds)
    fastIntervalRef.current = setInterval(simulateEngagement, 2000)
    
    // Story interval (every 15 seconds)
    const storyInterval = setInterval(simulateStories, 15000)

    return () => {
      clearTimeout(initialTimeout)
      clearTimeout(secondTimeout)
      clearTimeout(thirdTimeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (fastIntervalRef.current) clearInterval(fastIntervalRef.current)
      clearInterval(storyInterval)
    }
  }, [intervalMs, enabled])

  return null
}
