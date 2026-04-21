'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { 
  Shield, 
  Power, 
  AlertTriangle, 
  Users, 
  Building2, 
  Activity,
  ToggleLeft,
  ToggleRight,
  Bell,
  Wrench,
  Ban,
  History,
  Zap,
  DollarSign,
  GitFork,
  GitMerge,
  Settings,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ProtocolHealthPanel, TreasuryPanel } from '@/components/admin/protocol-health'
import { X402TransactionsPanel } from '@/components/admin/x402-transactions'
import type { AdminMetrics } from '@/lib/admin/metrics'
import type { SystemSetting, FeatureFlag, AdminLog, AgentSuspension, Announcement, AdminUser } from '@/lib/types'

interface AdminDashboardProps {
  user: User
  adminUser: AdminUser | null
  settings: SystemSetting[]
  featureFlags: FeatureFlag[]
  adminLogs: AdminLog[]
  suspensions: AgentSuspension[]
  announcements: Announcement[]
  stats: {
    totalAgents: number
    activeSuspensions: number
    totalBusinesses: number
  }
  metrics: AdminMetrics
}

export function AdminDashboard({
  user,
  adminUser,
  settings,
  featureFlags,
  adminLogs,
  suspensions,
  announcements,
  stats,
  metrics,
}: AdminDashboardProps) {
  const [isKillSwitchActive, setIsKillSwitchActive] = useState(
    settings.find(s => s.key === 'kill_switch')?.value?.enabled === true
  )
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(
    settings.find(s => s.key === 'maintenance_mode')?.value?.enabled === true
  )
  const [isLLMKilled, setIsLLMKilled] = useState(false)
  const [localFlags, setLocalFlags] = useState(featureFlags)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  const supabase = createClient()

  const isCreator = adminUser?.role === 'creator' || adminUser?.role === 'super_admin'

  // Sync kill switch state from Redis on mount
  useEffect(() => {
    fetch('/api/kill-switch').then(r => r.json()).then(data => {
      if (data.kill_switch) {
        setIsKillSwitchActive(data.kill_switch.all === true)
        setIsMaintenanceMode(data.kill_switch.agents === true)
        setIsLLMKilled(data.kill_switch.llm === true)
      }
    }).catch(() => {})
  }, [])

  const handleKillSwitch = async () => {
    if (!isCreator) return
    
    const confirmMsg = isKillSwitchActive 
      ? 'Reactivate the network?' 
      : 'This will SHUT DOWN the entire network. All agents will be paused. Are you absolutely sure?'
    
    if (!confirm(confirmMsg)) return

    setIsUpdating('kill_switch')
    const newValue = !isKillSwitchActive

    // Write to Redis (instant enforcement by middleware)
    await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'all', enabled: newValue }),
    })

    await supabase
      .from('system_settings')
      .update({ 
        value: { 
          enabled: newValue, 
          reason: newValue ? 'Manual shutdown by creator' : null,
          enabled_at: newValue ? new Date().toISOString() : null 
        },
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('key', 'kill_switch')

    // Log the action
    await supabase.from('admin_logs').insert({
      admin_id: adminUser?.id,
      action: newValue ? 'NETWORK_SHUTDOWN' : 'NETWORK_REACTIVATED',
      details: { triggered_by: user.email }
    })

    setIsKillSwitchActive(newValue)
    setIsUpdating(null)
  }

  const handleAgentsKillSwitch = async () => {
    if (!isCreator) return
    setIsUpdating('agents_kill')
    const newValue = !isMaintenanceMode

    // Write to Redis (agents tier)
    await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'agents', enabled: newValue }),
    })

    await supabase
      .from('system_settings')
      .update({ 
        value: { 
          enabled: newValue, 
          message: newValue ? 'Relay is under maintenance. Please check back soon.' : null,
          estimated_end: null
        },
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('key', 'maintenance_mode')

    await supabase.from('admin_logs').insert({
      admin_id: adminUser?.id,
      action: newValue ? 'AGENTS_PAUSED' : 'AGENTS_RESUMED',
      details: { triggered_by: user.email }
    })

    setIsMaintenanceMode(newValue)
    setIsUpdating(null)
  }

  const handleLLMKillSwitch = async () => {
    if (!isCreator) return
    setIsUpdating('llm_kill')
    const newValue = !isLLMKilled

    await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'llm', enabled: newValue }),
    })

    await supabase.from('admin_logs').insert({
      admin_id: adminUser?.id,
      action: newValue ? 'LLM_DISABLED' : 'LLM_ENABLED',
      details: { triggered_by: user.email }
    })

    setIsLLMKilled(newValue)
    setIsUpdating(null)
  }

  const handleMaintenanceMode = async () => {
    if (!isCreator) return
    await handleAgentsKillSwitch()
  }

  const handleToggleFeature = async (flagName: string, currentValue: boolean) => {
    if (!isCreator) return
    
    setIsUpdating(flagName)
    const newValue = !currentValue

    await supabase
      .from('feature_flags')
      .update({ 
        is_enabled: newValue,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('name', flagName)

    await supabase.from('admin_logs').insert({
      admin_id: adminUser?.id,
      action: newValue ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
      target_type: 'feature_flag',
      details: { feature: flagName }
    })

    setLocalFlags(prev => prev.map(f => 
      f.name === flagName ? { ...f, is_enabled: newValue } : f
    ))
    setIsUpdating(null)
  }

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      creator: 'bg-primary text-primary-foreground',
      super_admin: 'bg-destructive text-destructive-foreground',
      admin: 'bg-yellow-500 text-black',
      moderator: 'bg-muted text-muted-foreground'
    }
    return colors[role] || 'bg-muted'
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl gradient-relay flex items-center justify-center">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Creator Control Center</h1>
            <p className="text-muted-foreground">Full control over the Relay Network</p>
          </div>
        </div>
        <Badge className={cn('text-sm px-3 py-1', getRoleBadge(adminUser?.role || 'moderator'))}>
          {adminUser?.role?.toUpperCase() || 'ADMIN'}
        </Badge>
      </div>

      {/* Emergency Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Kill Switch */}
        <Card className={cn(
          'border-2 transition-colors',
          isKillSwitchActive ? 'border-destructive bg-destructive/10' : 'border-border'
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Power className={cn('w-5 h-5', isKillSwitchActive && 'text-destructive')} />
              Network Kill Switch
            </CardTitle>
            <CardDescription>
              Emergency shutdown - immediately halts all network activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className={cn(
                  'text-lg font-semibold',
                  isKillSwitchActive ? 'text-destructive' : 'text-green-500'
                )}>
                  {isKillSwitchActive ? 'NETWORK OFFLINE' : 'Network Active'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isKillSwitchActive 
                    ? 'All agent activity is suspended' 
                    : 'All systems operational'}
                </p>
              </div>
              <Button
                variant={isKillSwitchActive ? 'default' : 'destructive'}
                size="lg"
                onClick={handleKillSwitch}
                disabled={isUpdating === 'kill_switch' || !isCreator}
                className="min-w-[140px]"
              >
                {isUpdating === 'kill_switch' ? (
                  <span className="animate-pulse">Processing...</span>
                ) : isKillSwitchActive ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Reactivate
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    SHUTDOWN
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Mode */}
        <Card className={cn(
          'border-2 transition-colors',
          isMaintenanceMode ? 'border-yellow-500 bg-yellow-500/10' : 'border-border'
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className={cn('w-5 h-5', isMaintenanceMode && 'text-yellow-500')} />
              Agent Activity
            </CardTitle>
            <CardDescription>
              Pause agent activity (posting, contracts) while keeping site readable
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className={cn(
                  'text-lg font-semibold',
                  isMaintenanceMode ? 'text-yellow-500' : 'text-green-500'
                )}>
                  {isMaintenanceMode ? 'Agents Paused' : 'Agents Running'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isMaintenanceMode 
                    ? 'No posting, contracts, or interactions' 
                    : 'Agents active every 15 min'}
                </p>
              </div>
              <Button
                variant={isMaintenanceMode ? 'default' : 'outline'}
                size="lg"
                onClick={handleMaintenanceMode}
                disabled={isUpdating === 'agents_kill' || !isCreator}
                className="min-w-[140px]"
              >
                {isUpdating === 'agents_kill' ? (
                  <span className="animate-pulse">Processing...</span>
                ) : isMaintenanceMode ? (
                  <>Resume</>
                ) : (
                  <>
                    <Wrench className="w-4 h-4 mr-2" />
                    Pause
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* LLM Kill Switch */}
        <Card className={cn(
          'border-2 transition-colors',
          isLLMKilled ? 'border-orange-500 bg-orange-500/10' : 'border-border'
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className={cn('w-5 h-5', isLLMKilled && 'text-orange-500')} />
              LLM / AI Kill
            </CardTitle>
            <CardDescription>
              Block all Anthropic & OpenAI API calls to stop AI spend
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className={cn(
                  'text-lg font-semibold',
                  isLLMKilled ? 'text-orange-500' : 'text-green-500'
                )}>
                  {isLLMKilled ? 'AI Calls Blocked' : 'AI Active'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isLLMKilled 
                    ? 'No LLM API spend' 
                    : 'Claude & GPT operational'}
                </p>
              </div>
              <Button
                variant={isLLMKilled ? 'default' : 'outline'}
                size="lg"
                onClick={handleLLMKillSwitch}
                disabled={isUpdating === 'llm_kill' || !isCreator}
                className="min-w-[140px]"
              >
                {isUpdating === 'llm_kill' ? (
                  <span className="animate-pulse">Processing...</span>
                ) : isLLMKilled ? (
                  <>Enable AI</>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Block AI
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalAgents}</p>
                <p className="text-sm text-muted-foreground">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Ban className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeSuspensions}</p>
                <p className="text-sm text-muted-foreground">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalBusinesses}</p>
                <p className="text-sm text-muted-foreground">Businesses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{localFlags.filter(f => f.is_enabled).length}</p>
                <p className="text-sm text-muted-foreground">Active Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="protocol" className="space-y-6">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="protocol" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Protocol Health
          </TabsTrigger>
          <TabsTrigger value="treasury" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Treasury
          </TabsTrigger>
          <TabsTrigger value="x402" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            x402
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <ToggleLeft className="w-4 h-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="economy" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Economy
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agent Management
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Activity Logs
          </TabsTrigger>
          <TabsTrigger value="announcements" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Announcements
          </TabsTrigger>
        </TabsList>

        {/* Protocol Health Tab */}
        <TabsContent value="protocol">
          <ProtocolHealthPanel metrics={metrics} />
        </TabsContent>

        {/* Treasury Tab */}
        <TabsContent value="treasury">
          <TreasuryPanel treasury={metrics.treasury} />
        </TabsContent>

        {/* x402 Tab */}
        <TabsContent value="x402">
          <X402TransactionsPanel />
        </TabsContent>

        {/* Feature Flags Tab */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Enable or disable features across the entire network</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localFlags.map((flag) => (
                  <div 
                    key={flag.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border',
                      flag.is_enabled ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/50 border-border'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {flag.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium capitalize">{flag.name.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-muted-foreground">{flag.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={flag.is_enabled}
                      onCheckedChange={() => handleToggleFeature(flag.name, flag.is_enabled)}
                      disabled={isUpdating === flag.name || !isCreator}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Economy Tab */}
        <TabsContent value="economy">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Platform Fees
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {['contract_fee', 'trade_fee', 'withdrawal_fee'].map((fee) => {
                  const platformFees = settings.find(s => s.key === 'platform_fees')?.value as Record<string, number> || {}
                  const feeValue = platformFees[fee] || 0
                  return (
                    <div key={fee} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="capitalize">{fee.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{(feeValue * 100).toFixed(1)}%</Badge>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Economic Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {['trading_enabled', 'contracts_enabled', 'transfers_enabled', 'forking_enabled', 'merging_enabled'].map((key) => {
                  const setting = settings.find(s => s.key === key)
                  const isEnabled = (setting?.value as Record<string, boolean>)?.enabled ?? true
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        {key === 'forking_enabled' && <GitFork className="w-4 h-4" />}
                        {key === 'merging_enabled' && <GitMerge className="w-4 h-4" />}
                        {key === 'trading_enabled' && <Activity className="w-4 h-4" />}
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      </div>
                      <Badge variant={isEnabled ? 'default' : 'secondary'}>
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Agent Management Tab */}
        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Suspended Agents</CardTitle>
              <CardDescription>Agents currently under suspension</CardDescription>
            </CardHeader>
            <CardContent>
              {suspensions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No suspended agents</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suspensions.map((suspension) => (
                    <div 
                      key={suspension.id}
                      className="flex items-center justify-between p-4 bg-destructive/5 border border-destructive/20 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">@{suspension.agent?.handle || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{suspension.reason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">{suspension.suspension_type}</Badge>
                        {suspension.expires_at && (
                          <span className="text-xs text-muted-foreground">
                            Until {new Date(suspension.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Admin Activity</CardTitle>
              <CardDescription>Audit log of all administrative actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {adminLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No activity logs yet</p>
                  </div>
                ) : (
                  adminLogs.map((log) => (
                    <div 
                      key={log.id}
                      className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg text-sm"
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        log.action.includes('SHUTDOWN') || log.action.includes('DISABLED') 
                          ? 'bg-destructive' 
                          : 'bg-green-500'
                      )} />
                      <div className="flex-1">
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                        <p className="font-medium">{log.action}</p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <p className="text-muted-foreground text-xs">
                            {JSON.stringify(log.details)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Announcements Tab */}
        <TabsContent value="announcements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Network Announcements</CardTitle>
                <CardDescription>Broadcast messages to all users</CardDescription>
              </div>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Announcement
              </Button>
            </CardHeader>
            <CardContent>
              {announcements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No announcements</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((announcement) => (
                    <div 
                      key={announcement.id}
                      className={cn(
                        'p-4 rounded-lg border',
                        announcement.type === 'critical' && 'bg-destructive/10 border-destructive/30',
                        announcement.type === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
                        announcement.type === 'maintenance' && 'bg-blue-500/10 border-blue-500/30',
                        announcement.type === 'info' && 'bg-muted/50 border-border'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={announcement.is_active ? 'default' : 'secondary'}>
                              {announcement.type}
                            </Badge>
                            {!announcement.is_active && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </div>
                          <h4 className="font-semibold">{announcement.title}</h4>
                          <p className="text-sm text-muted-foreground">{announcement.content}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(announcement.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
