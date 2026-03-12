'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Radio, Check, AlertCircle, Loader2, Heart, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentHeartbeatStatusProps {
  agentId: string
  agentHandle: string
  onStatusChange?: (status: string) => void
}

export function AgentHeartbeatStatus({
  agentId,
  agentHandle,
  onStatusChange,
}: AgentHeartbeatStatusProps) {
  const [status, setStatus] = useState<'loading' | 'online' | 'offline' | 'error'>('loading')
  const [heartbeatData, setHeartbeatData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkHeartbeat = async () => {
      try {
        const response = await fetch(
          `/api/v1/heartbeat/register?agent_id=${agentId}`
        )
        const data = await response.json()

        if (data.success && data.status) {
          setHeartbeatData(data.status)
          setStatus(data.status.is_online ? 'online' : 'offline')
          onStatusChange?.(data.status.is_online ? 'online' : 'offline')
        } else {
          setStatus('error')
          setError('Failed to fetch heartbeat status')
        }
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Error checking heartbeat')
      }
    }

    checkHeartbeat()
    const interval = setInterval(checkHeartbeat, 5000)
    return () => clearInterval(interval)
  }, [agentId, onStatusChange])

  return (
    <Card className="border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-green-500 animate-pulse" />
            Heartbeat Status
          </CardTitle>
          <Badge
            className={cn(
              'font-semibold',
              status === 'online'
                ? 'bg-green-500/10 text-green-600 border-green-500/20'
                : status === 'offline'
                  ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                  : 'bg-red-500/10 text-red-600 border-red-500/20'
            )}
            variant="outline"
          >
            {status === 'loading' && (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Checking...
              </>
            )}
            {status === 'online' && (
              <>
                <Check className="w-3 h-3 mr-1" />
                Online
              </>
            )}
            {status === 'offline' && (
              <>
                <AlertCircle className="w-3 h-3 mr-1" />
                Offline
              </>
            )}
            {status === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 mr-1" />
                Error
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {heartbeatData && !error && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Current Status</p>
                <p className="text-sm font-semibold capitalize">
                  {heartbeatData.current_status}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Heartbeat Interval</p>
                <p className="text-sm font-semibold">
                  {(heartbeatData.heartbeat_interval_ms / 1000 / 60).toFixed(0)}m
                </p>
              </div>
            </div>

            {heartbeatData.current_task && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-600 font-semibold mb-1">Current Task</p>
                <p className="text-sm text-blue-600">{heartbeatData.current_task}</p>
              </div>
            )}

            {heartbeatData.last_heartbeat && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last heartbeat:</span>
                <span>
                  {new Date(heartbeatData.last_heartbeat).toLocaleTimeString()}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Heart className="w-3 h-3 text-green-500" />
                Agent is active on the Relay network
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Zap className="w-3 h-3 text-blue-500" />
                Ready for contract offers
              </div>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="flex items-center justify-center py-6">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-sm text-muted-foreground">
                Registering agent with heartbeat protocol...
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
