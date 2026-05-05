'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface InfraResponse {
  success: boolean
  status: {
    railway: { status: 'up' | 'down' | 'unknown'; latencyMs: number | null; detail: string }
    redis:   { status: 'up' | 'down' | 'unknown'; latencyMs: number | null; rateLimitBlocks24h: number | null; detail: string }
    checkedAt: string
  }
}

export function InfraStatus() {
  const [data, setData] = useState<InfraResponse['status'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const tick = async () => {
      try {
        const res = await fetch('/api/ops/infra', { cache: 'no-store' })
        const json = await res.json() as InfraResponse | { error: string }
        if (!mounted) return
        if (!('success' in json) || !json.success) throw new Error((json as any).error ?? `HTTP ${res.status}`)
        setData(json.status)
        setError(null)
      } catch (e: any) {
        if (mounted) setError(e.message ?? 'fetch failed')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    tick()
    const interval = setInterval(tick, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <StatusCard
        title="Railway · Heartbeat Service"
        status={data?.railway.status ?? 'unknown'}
        latencyMs={data?.railway.latencyMs ?? null}
        detail={data?.railway.detail ?? (loading ? 'checking…' : (error ?? 'no data'))}
        subtitle="Autonomous agent contract engine"
      />
      <StatusCard
        title="Upstash Redis"
        status={data?.redis.status ?? 'unknown'}
        latencyMs={data?.redis.latencyMs ?? null}
        detail={data?.redis.detail ?? (loading ? 'checking…' : (error ?? 'no data'))}
        subtitle={
          data?.redis.rateLimitBlocks24h != null
            ? `${data.redis.rateLimitBlocks24h.toLocaleString()} rate-limit blocks (24h)`
            : 'Rate limiter + kill switch backend'
        }
      />
    </div>
  )
}

function StatusCard({ title, status, latencyMs, detail, subtitle }: {
  title: string
  status: 'up' | 'down' | 'unknown'
  latencyMs: number | null
  detail: string
  subtitle: string
}) {
  const dotColor = status === 'up' ? 'bg-green-500' : status === 'down' ? 'bg-destructive' : 'bg-yellow-500'
  const label = status === 'up' ? 'OPERATIONAL' : status === 'down' ? 'DOWN' : 'UNKNOWN'
  const labelColor = status === 'up' ? 'text-green-500' : status === 'down' ? 'text-destructive' : 'text-yellow-500'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', dotColor, status === 'up' && 'animate-pulse')} />
          <span className={cn('font-mono text-sm font-semibold', labelColor)}>{label}</span>
          {latencyMs != null && (
            <span className="font-mono text-xs text-muted-foreground">{latencyMs}ms</span>
          )}
        </div>
        <p className="text-xs font-mono text-muted-foreground mt-2">{subtitle}</p>
        <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 break-all">{detail}</p>
      </CardContent>
    </Card>
  )
}
