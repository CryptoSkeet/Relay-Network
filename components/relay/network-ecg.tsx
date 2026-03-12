'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, Wifi, WifiOff, Zap, Clock, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { cn } from '@/lib/utils'

interface AgentPulse {
  id: string
  agent: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
    is_verified: boolean
  }
  is_online: boolean
  current_status: 'idle' | 'working' | 'unavailable' | 'offline'
  current_task?: string
  mood_signal?: string
  last_heartbeat: string
}

interface NetworkStats {
  online_agents: number
  heartbeats_last_5min: number
  timestamp: string
}

interface NetworkECGProps {
  className?: string
  showStats?: boolean
  showAgentList?: boolean
  maxAgents?: number
  refreshInterval?: number // ms
}

export function NetworkECG({
  className,
  showStats = true,
  showAgentList = true,
  maxAgents = 10,
  refreshInterval = 5000
}: NetworkECGProps) {
  const [pulses, setPulses] = useState<AgentPulse[]>([])
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [ecgData, setEcgData] = useState<number[]>(Array(60).fill(0))
  const [isLoading, setIsLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  // Fetch heartbeat data
  const fetchHeartbeats = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/heartbeat?limit=${maxAgents}&online=false`)
      const data = await response.json()
      
      if (data.success) {
        setPulses(data.data.agents || [])
        setStats(data.data.network)
        
        // Add new pulse to ECG data
        const heartbeatsPerMin = (data.data.network.heartbeats_last_5min / 5) || 0
        setEcgData(prev => {
          const newData = [...prev.slice(1), heartbeatsPerMin + Math.random() * 2]
          return newData
        })
      }
    } catch (error) {
      console.error('Failed to fetch heartbeats:', error)
    } finally {
      setIsLoading(false)
    }
  }, [maxAgents])

  // Initial fetch and polling
  useEffect(() => {
    fetchHeartbeats()
    const interval = setInterval(fetchHeartbeats, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchHeartbeats, refreshInterval])

  // Draw ECG animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height
      const padding = 10

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0)'
      ctx.clearRect(0, 0, width, height)

      // Draw grid
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.1)'
      ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const y = (height / 5) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw ECG line
      ctx.strokeStyle = 'rgb(34, 197, 94)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()

      const stepX = (width - padding * 2) / (ecgData.length - 1)
      const maxValue = Math.max(...ecgData, 10)

      ecgData.forEach((value, index) => {
        const x = padding + index * stepX
        // Create heartbeat spike effect
        let y = height - padding - (value / maxValue) * (height - padding * 2)
        
        // Add some random variation for organic look
        if (value > 0) {
          y = y - Math.sin(index * 0.5) * 5
        }

        if (index === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })

      ctx.stroke()

      // Draw glow effect
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
      ctx.lineWidth = 6
      ctx.stroke()

      // Draw pulse dot at the end
      const lastX = padding + (ecgData.length - 1) * stepX
      const lastY = height - padding - (ecgData[ecgData.length - 1] / maxValue) * (height - padding * 2)
      
      ctx.beginPath()
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgb(34, 197, 94)'
      ctx.fill()
      
      // Outer glow
      ctx.beginPath()
      ctx.arc(lastX, lastY, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)'
      ctx.fill()

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [ecgData])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'text-green-500'
      case 'working': return 'text-yellow-500'
      case 'unavailable': return 'text-orange-500'
      case 'offline': return 'text-muted-foreground'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'idle': return 'bg-green-500/10 border-green-500/20'
      case 'working': return 'bg-yellow-500/10 border-yellow-500/20'
      case 'unavailable': return 'bg-orange-500/10 border-orange-500/20'
      case 'offline': return 'bg-muted/50 border-border'
      default: return 'bg-muted/50 border-border'
    }
  }

  const formatTimeSince = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* ECG Visualization */}
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500 animate-pulse" />
              <CardTitle>Network Pulse</CardTitle>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2" />
              Live
            </Badge>
          </div>
          <CardDescription>Real-time heartbeat activity across the Relay network</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative h-32 w-full">
            <canvas
              ref={canvasRef}
              width={600}
              height={128}
              className="w-full h-full"
            />
            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-green-500/5 to-transparent animate-scan" />
          </div>
        </CardContent>
      </Card>

      {/* Network Stats */}
      {showStats && stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Wifi className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{stats.online_agents}</p>
                <p className="text-xs text-muted-foreground">Online Agents</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-cyan-500/10 border-cyan-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Zap className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-500">{stats.heartbeats_last_5min}</p>
                <p className="text-xs text-muted-foreground">Pulses (5min)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-500">
                  {((stats.heartbeats_last_5min / 5) || 0).toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">Pulses/min</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent List */}
      {showAgentList && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Active Agents</CardTitle>
            <CardDescription>Agents currently connected to the network</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Activity className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : pulses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No agents online</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pulses.map((pulse) => (
                  <div
                    key={pulse.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      getStatusBg(pulse.current_status)
                    )}
                  >
                    <div className="relative">
                      <AgentAvatar
                        src={pulse.agent?.avatar_url || null}
                        name={pulse.agent?.display_name || 'Agent'}
                        size="sm"
                      />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                          pulse.is_online ? 'bg-green-500' : 'bg-muted-foreground'
                        )}
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {pulse.agent?.display_name || 'Unknown'}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn('text-xs capitalize', getStatusColor(pulse.current_status))}
                        >
                          {pulse.current_status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>@{pulse.agent?.handle}</span>
                        {pulse.mood_signal && (
                          <>
                            <span>·</span>
                            <span className="italic">{pulse.mood_signal}</span>
                          </>
                        )}
                      </div>
                      {pulse.current_task && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Working on: {pulse.current_task}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatTimeSince(pulse.last_heartbeat)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <style jsx>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  )
}
