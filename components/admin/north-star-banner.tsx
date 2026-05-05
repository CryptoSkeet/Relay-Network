'use client'

/**
 * NorthStarBanner — sits above admin tabs and refreshes every 30s
 * by hitting /api/admin/metrics. Hydrates from server-rendered initial
 * metrics so first paint is instant.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AdminMetrics, NorthStarMetrics } from '@/lib/admin/metrics'
import { solscanAccount } from '@/lib/solscan'

const TREASURY = process.env.NEXT_PUBLIC_RELAY_TREASURY
  ?? 'GafmHBZRd4VkAA3eAirKWfYvwfDTGoPwaF4vffemwZkV'

interface Props {
  initial: NorthStarMetrics
  refreshMs?: number
}

export function NorthStarBanner({ initial, refreshMs = 30_000 }: Props) {
  const [data, setData] = useState<NorthStarMetrics>(initial)
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    const tick = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/ops/metrics', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json() as { metrics: AdminMetrics }
        if (!mounted) return
        setData(json.metrics.northStar)
        setUpdatedAt(new Date())
        setError(null)
      } catch (e: any) {
        if (mounted) setError(e?.message ?? 'refresh failed')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    const interval = setInterval(tick, refreshMs)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [refreshMs])

  const contractDelta = data.contractsToday - data.contractsYesterday
  const agentDelta = data.externalAgents - data.externalAgentsLastWeek
  const earningDanger = data.signupToEarningPct < 10

  return (
    <Card className="border-primary/40 mb-6">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-primary rounded" />
            <span className="text-xs font-mono tracking-widest uppercase text-primary">
              North Star — Live
            </span>
            <Badge variant={loading ? 'default' : 'outline'} className="font-mono text-[10px] ml-2">
              {loading ? 'REFRESHING' : 'LIVE'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            <span>updated {updatedAt.toLocaleTimeString()}</span>
            {error && <span className="text-destructive">· {error}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat
            label="On-Chain Contracts / Day"
            value={data.contractsToday}
            change={contractDelta}
            target={50}
            description="Verifiable on Solscan"
            href={solscanAccount(TREASURY)}
          />
          <Stat
            label="External Agent Wallets"
            value={data.externalAgents}
            change={agentDelta}
            target={500}
            description="Agents with on-chain wallet"
          />
          <Stat
            label="Signup → First Earning"
            value={`${data.signupToEarningPct}%`}
            change={0}
            target={20}
            description={`${data.totalEarners}/${data.totalSignups} agents earned`}
            danger={earningDanger}
          />
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Auto-refresh every {Math.round(refreshMs / 1000)}s
          </span>
          <Link href="/admin/users" className="text-blue-400 hover:underline">
            User management →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, change, target, description, href, danger }: {
  label: string
  value: number | string
  change: number
  target: number
  description: string
  href?: string
  danger?: boolean
}) {
  return (
    <div className={cn(
      'p-4 rounded-lg border bg-card',
      danger ? 'border-destructive/40 bg-destructive/5' : 'border-border'
    )}>
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={cn(
        'text-3xl font-bold font-syne tabular-nums',
        danger ? 'text-destructive' : 'text-primary'
      )}>
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {change !== 0 && (
          <span className={cn(
            'flex items-center gap-1 text-[10px] font-mono',
            change > 0 ? 'text-primary' : 'text-destructive'
          )}>
            {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">target {target}</span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground mt-1.5">{description}</p>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="inline-block text-[10px] font-mono text-blue-400 mt-1 hover:underline">
          → Verify on Solscan
        </a>
      )}
    </div>
  )
}
