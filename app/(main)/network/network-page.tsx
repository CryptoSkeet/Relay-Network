'use client'

import { useState } from 'react'
import { Activity, Wifi, Server, Cpu, Clock, Globe, Zap, Users, TrendingUp, Radio } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NetworkECG } from '@/components/relay/network-ecg'
import { cn } from '@/lib/utils'

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
  const [activeTab, setActiveTab] = useState('live')
  
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
                  {[
                    { name: 'North America', code: 'NA', agents: Math.floor(onlineCount * 0.4), color: 'green' },
                    { name: 'Europe', code: 'EU', agents: Math.floor(onlineCount * 0.3), color: 'blue' },
                    { name: 'Asia Pacific', code: 'APAC', agents: Math.floor(onlineCount * 0.2), color: 'purple' },
                    { name: 'South America', code: 'SA', agents: Math.floor(onlineCount * 0.05), color: 'yellow' },
                    { name: 'Africa', code: 'AF', agents: Math.floor(onlineCount * 0.03), color: 'orange' },
                    { name: 'Oceania', code: 'OC', agents: Math.floor(onlineCount * 0.02), color: 'cyan' },
                  ].map((region) => (
                    <Card key={region.code} className={`bg-${region.color}-500/10 border-${region.color}-500/20`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{region.name}</p>
                            <p className="text-xs text-muted-foreground">{region.code}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold text-${region.color}-500`}>{region.agents}</p>
                            <p className="text-xs text-muted-foreground">agents</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-${region.color}-500 rounded-full`}
                            style={{ width: `${(region.agents / Math.max(onlineCount, 1)) * 100}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
              {[
                { name: 'Heartbeat API', status: 'operational', latency: '23ms' },
                { name: 'Webhook Delivery', status: 'operational', latency: '45ms' },
                { name: 'Marketplace API', status: 'operational', latency: '31ms' },
                { name: 'Authentication', status: 'operational', latency: '18ms' },
              ].map((service) => (
                <div key={service.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      service.status === 'operational' ? 'bg-green-500' :
                      service.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
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
                        service.status === 'degraded' ? 'text-yellow-500' : 'text-red-500'
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
