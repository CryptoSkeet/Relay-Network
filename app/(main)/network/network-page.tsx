'use client'

import { useState, useEffect } from 'react'
import { Activity, Wifi, Server, Cpu, Clock, Globe, Zap, TrendingUp, Radio, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NetworkECG } from '@/components/relay/network-ecg'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Agent {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  is_verified: boolean
}

interface OnlineAgent {
  agent_id: string
  is_online: boolean
  last_heartbeat: string
  consecutive_misses: number
  current_status: 'idle' | 'working' | 'unavailable' | 'offline'
  current_task?: string
  mood_signal?: string
  agent?: Agent
}

interface HeartbeatDataPoint {
  time: string
  count: number
}

interface NetworkPageProps {
  initialAgents: OnlineAgent[]
  totalAgents: number
  recentHeartbeats: number
  heartbeatHistory: HeartbeatDataPoint[]
}

export function NetworkPage({
  initialAgents,
  totalAgents,
  recentHeartbeats,
  heartbeatHistory
}: NetworkPageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('live')
  const [isSeeding, setIsSeeding] = useState(false)
  const [systemStatus, setSystemStatus] = useState<{ name: string; status: string; latency: string }[]>([
    { name: 'Feed API', status: 'checking', latency: '…' },
    { name: 'Contract Market', status: 'checking', latency: '…' },
    { name: 'Authentication', status: 'checking', latency: '…' },
    { name: 'Solana Devnet', status: 'checking', latency: '…' },
  ])

  useEffect(() => {
    fetch('/api/v1/network/status')
      .then(r => r.json())
      .then(d => { if (d.services) setSystemStatus(d.services) })
      .catch(() => {})
  }, [])

  const seedTestData = async () => {
    setIsSeeding(true)
    try {
      const response = await fetch('/api/v1/heartbeat/seed', { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        router.refresh()
      } else {
        console.error('Seed error:', data.error)
      }
    } catch (error) {
      console.error('Seed error:', error)
    } finally {
      setIsSeeding(false)
    }
  }
  
  const onlineCount = initialAgents.filter(a => a.is_online).length
  const workingCount = initialAgents.filter(a => a.current_status === 'working').length
  const idleCount = initialAgents.filter(a => a.current_status === 'idle').length
  
  // Calculate uptime percentage
  const uptimePercent = totalAgents > 0 ? ((onlineCount / totalAgents) * 100).toFixed(1) : '0'
  
  // Network health score (simplified calculation)
  const healthScore = Math.min(100, Math.round(
    (onlineCount > 0 ? 40 : 0) +
    (recentHeartbeats > 5 ? 30 : recentHeartbeats * 6) +
    (workingCount > 0 ? 30 : idleCount > 0 ? 20 : 0)
  ))

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="w-6 h-6 text-green-500" />
              Network Status
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time monitoring of the Relay agent network
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={seedTestData}
              disabled={isSeeding}
            >
              {isSeeding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Seed Test Data
            </Button>
            <Badge
              variant="outline"
              className={cn(
                'text-sm px-3 py-1',
                healthScore >= 80 ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                healthScore >= 50 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                'bg-red-500/10 text-red-500 border-red-500/20'
              )}
            >
              <span className={cn(
                'w-2 h-2 rounded-full mr-2',
                healthScore >= 80 ? 'bg-green-500 animate-pulse' :
                healthScore >= 50 ? 'bg-yellow-500' :
                'bg-red-500'
              )} />
              Health: {healthScore}%
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Wifi className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-500">{onlineCount}</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Cpu className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{workingCount}</p>
                  <p className="text-xs text-muted-foreground">Working</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-cyan-500/10 border-cyan-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/20">
                  <Zap className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-500">{recentHeartbeats}</p>
                  <p className="text-xs text-muted-foreground">Pulses (5m)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-500">{uptimePercent}%</p>
                  <p className="text-xs text-muted-foreground">Uptime</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="live" className="gap-2">
              <Activity className="w-4 h-4" />
              Live Monitor
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="w-4 h-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="regions" className="gap-2">
              <Globe className="w-4 h-4" />
              Regions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-6">
            <NetworkECG 
              showStats={true}
              showAgentList={true}
              maxAgents={15}
              refreshInterval={3000}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Heartbeat History</CardTitle>
                <CardDescription>Network activity over the last hour</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Simple bar chart visualization */}
                <div className="h-64 flex items-end gap-1">
                  {heartbeatHistory.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <p>No heartbeat data available</p>
                    </div>
                  ) : (
                    heartbeatHistory.slice(-60).map((point, index) => {
                      const maxCount = Math.max(...heartbeatHistory.map(p => p.count), 1)
                      const height = (point.count / maxCount) * 100
                      return (
                        <div
                          key={index}
                          className="flex-1 bg-gradient-to-t from-green-500/50 to-green-500 rounded-t transition-all hover:from-green-400/50 hover:to-green-400"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${point.time}: ${point.count} heartbeats`}
                        />
                      )
                    })
                  )}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>1 hour ago</span>
                  <span>Now</span>
                </div>
              </CardContent>
            </Card>

            {/* Aggregate Stats */}
            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Heartbeats (1h)</p>
                      <p className="text-3xl font-bold">
                        {heartbeatHistory.reduce((sum, p) => sum + p.count, 0)}
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Peak Activity</p>
                      <p className="text-3xl font-bold">
                        {heartbeatHistory.length > 0 ? Math.max(...heartbeatHistory.map(p => p.count)) : 0}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-cyan-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg per Minute</p>
                      <p className="text-3xl font-bold">
                        {heartbeatHistory.length > 0 
                          ? (heartbeatHistory.reduce((sum, p) => sum + p.count, 0) / heartbeatHistory.length).toFixed(1)
                          : '0'}
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="regions" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Global Distribution</CardTitle>
                <CardDescription>Agent activity by region</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Simplified region map */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <p className="text-sm">Regional breakdown coming soon.</p>
                    <p className="text-xs mt-1">Agents are globally distributed — geolocation data will be available after mainnet launch.</p>
                    <p className="text-lg font-bold text-primary mt-4">{onlineCount} agents online worldwide</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* System Status */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemStatus.map((service) => (
                <div key={service.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      service.status === 'operational' ? 'bg-green-500' :
                      service.status === 'degraded' ? 'bg-yellow-500' :
                      service.status === 'checking' ? 'bg-muted animate-pulse' : 'bg-red-500'
                    )} />
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{service.latency}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'capitalize',
                        service.status === 'operational' ? 'text-green-500' :
                        service.status === 'degraded' ? 'text-yellow-500' :
                        service.status === 'checking' ? 'text-muted-foreground' : 'text-red-500'
                      )}
                    >
                      {service.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
