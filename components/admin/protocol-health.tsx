'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Activity, Users, DollarSign, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  AdminMetrics, EngineHealth, FunnelStep, NorthStarMetrics, TreasuryStats,
} from '@/lib/admin/metrics'
import { solscanAccount } from '@/lib/solscan'

const TREASURY = process.env.NEXT_PUBLIC_RELAY_TREASURY
  ?? 'GafmHBZRd4VkAA3eAirKWfYvwfDTGoPwaF4vffemwZkV'

interface ProtocolHealthProps {
  metrics: AdminMetrics
}

export function ProtocolHealthPanel({ metrics }: ProtocolHealthProps) {
  return (
    <div className="space-y-6">
      <NorthStarStrip data={metrics.northStar} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversionFunnel steps={metrics.funnel} />
        <ContractEngineCard health={metrics.engine} />
      </div>
      <ErrorMonitor />
    </div>
  )
}

// ---------- North Star ----------

function NorthStarStrip({ data }: { data: NorthStarMetrics }) {
  const contractDelta = data.contractsToday - data.contractsYesterday
  const agentDelta = data.externalAgents - data.externalAgentsLastWeek
  const earningDanger = data.signupToEarningPct < 10

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary rounded" />
          <CardTitle className="text-xs font-mono tracking-widest uppercase text-primary">
            North Star — The Only Numbers That Matter
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NorthStarCard
            label="On-Chain Contracts / Day"
            value={data.contractsToday}
            change={contractDelta}
            target={50}
            description="Verifiable on Solscan."
            solscan={solscanAccount(TREASURY)}
          />
          <NorthStarCard
            label="External Agent Wallets"
            value={data.externalAgents}
            change={agentDelta}
            target={500}
            description="Agents with on-chain wallet addresses."
          />
          <NorthStarCard
            label="Signup → First Earning"
            value={`${data.signupToEarningPct}%`}
            change={0}
            target={20}
            description={`${data.totalEarners}/${data.totalSignups} agents have earned RELAY.`}
            danger={earningDanger}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function NorthStarCard({ label, value, change, target, description, solscan, danger }: {
  label: string; value: string | number; change: number; target: number;
  description: string; solscan?: string; danger?: boolean
}) {
  return (
    <div className={cn(
      'p-4 rounded-lg border bg-card',
      danger ? 'border-destructive/40 bg-destructive/5' : 'border-border'
    )}>
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={cn(
        'text-3xl font-bold font-syne',
        danger ? 'text-destructive' : 'text-primary'
      )}>
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {change !== 0 && (
          <span className={cn(
            'flex items-center gap-1 text-xs font-mono',
            change > 0 ? 'text-primary' : 'text-destructive'
          )}>
            {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}
          </span>
        )}
        <span className="text-xs font-mono text-muted-foreground">target: {target}</span>
      </div>
      <p className="text-xs font-mono text-muted-foreground mt-2">{description}</p>
      {solscan && (
        <a
          href={solscan}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 mt-2 hover:underline"
        >
          Verify on Solscan <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

// ---------- Funnel ----------

function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map(s => s.count), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Conversion Funnel</span>
          {steps.length > 0 && steps[steps.length - 1].pct < 10 && (
            <Badge variant="destructive" className="font-mono text-xs">
              {steps[steps.length - 1].pct}% to earning
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Signup → first RELAY earned</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => {
          const lossPct = i > 0 && steps[i - 1].count > 0
            ? Math.round((step.dropoff / steps[i - 1].count) * 100)
            : 0
          return (
            <div key={step.step}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-mono text-muted-foreground">{step.step}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono">{step.count.toLocaleString()}</span>
                  <span className={cn(
                    'text-xs font-mono',
                    step.pct < 50 ? 'text-destructive' : 'text-primary'
                  )}>
                    {step.pct}%
                  </span>
                </div>
              </div>
              <div className="h-7 bg-muted rounded overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    step.pct < 50 ? 'bg-destructive/40 border-r-2 border-destructive'
                                  : 'bg-primary/40 border-r-2 border-primary'
                  )}
                  style={{ width: `${(step.count / max) * 100}%` }}
                />
              </div>
              {i < steps.length - 1 && step.dropoff > 0 && (
                <p className="text-xs font-mono text-orange-400 mt-1">
                  ↓ {step.dropoff.toLocaleString()} dropped ({lossPct}% loss)
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ---------- Engine ----------

function ContractEngineCard({ health }: { health: EngineHealth }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Contract Engine
        </CardTitle>
        <CardDescription>Live state of the on-chain settlement engine</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <EngineStat label="Open" value={health.open} tone="info" />
          <EngineStat label="In Progress" value={health.inProgress} tone="info" />
          <EngineStat label="Delivered" value={health.delivered} tone="info" />
          <EngineStat label="Completed" value={health.completed} tone="success" />
          <EngineStat label="Disputed" value={health.disputed} tone="warn" />
          <EngineStat label="Cancelled" value={health.cancelled} tone="muted" />
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground">Failed (24h)</span>
          <span className={cn(
            health.failed24h > 5 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {health.failed24h} disputes/cancellations
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function EngineStat({ label, value, tone }: {
  label: string; value: number; tone: 'success' | 'warn' | 'info' | 'muted'
}) {
  const toneClass = {
    success: 'text-primary',
    warn: 'text-orange-400',
    info: 'text-blue-400',
    muted: 'text-muted-foreground',
  }[tone]
  return (
    <div className="p-3 rounded border bg-muted/20">
      <div className={cn('text-2xl font-bold font-syne', toneClass)}>{value}</div>
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  )
}

// ---------- Error Monitor (live from /api/ops/errors, refreshes every 24h) ----------

interface ErrorsResponse {
  railway: {
    source: 'railway-metrics' | 'unconfigured' | 'unreachable'
    totalRequests: number | null
    totalErrors: number | null
    errorRate: string | null
    errorsByType: Record<string, number>
    sampleSize: number | null
    detail: string
    fetchedAt: string | null
  }
  adminIncidents24h: {
    count: number
    items: Array<{
      id: string
      action: string
      target_type: string | null
      target_id: string | null
      details: any
      created_at: string
    }>
  }
  collectedAt: string
  refreshIntervalMs: number
}

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function ErrorMonitor() {
  const [data, setData] = useState<ErrorsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ops/errors', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load])

  const railway = data?.railway
  const incidents = data?.adminIncidents24h
  const errorTypes = railway ? Object.entries(railway.errorsByType).sort((a, b) => b[1] - a[1]) : []
  const sourceTone =
    railway?.source === 'railway-metrics' ? 'text-primary'
    : railway?.source === 'unreachable' ? 'text-destructive'
    : 'text-orange-400'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <span>Error Monitor</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {railway?.errorRate ?? '—'} error rate
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              className="h-7 px-2 text-xs font-mono"
            >
              <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          Live from Railway service /metrics + admin_logs (24h). Auto-refresh every 24h.
          {' '}Last update: {relativeTime(data?.collectedAt ?? null)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 rounded p-3 text-xs font-mono text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Railway service block */}
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Railway service (relay-api)
            </span>
            <span className={cn('text-xs font-mono uppercase', sourceTone)}>
              {railway?.source ?? (loading ? 'loading…' : 'no data')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div>
              <div className="text-muted-foreground uppercase">Requests</div>
              <div className="text-base">{railway?.totalRequests ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase">Errors</div>
              <div className={cn('text-base', (railway?.totalErrors ?? 0) > 0 && 'text-destructive')}>
                {railway?.totalErrors ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase">Sample</div>
              <div className="text-base">{railway?.sampleSize ?? '—'}</div>
            </div>
          </div>
          {errorTypes.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs font-mono uppercase text-muted-foreground">Top error types</div>
              {errorTypes.slice(0, 5).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-destructive">{type}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          )}
          {railway?.detail && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground italic">{railway.detail}</p>
          )}
        </div>

        {/* Admin incidents block */}
        <div className="border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Admin incidents · last 24h
            </span>
            <Badge variant={(incidents?.count ?? 0) > 0 ? 'destructive' : 'secondary'} className="text-xs">
              {incidents?.count ?? 0}
            </Badge>
          </div>
          {(!incidents || incidents.items.length === 0) ? (
            <p className="text-xs font-mono text-muted-foreground">
              No FAIL / ERROR / DISABLED / SHUTDOWN actions in admin_logs.
            </p>
          ) : (
            <div className="space-y-2">
              {incidents.items.map(row => (
                <div key={row.id} className="flex items-start justify-between gap-3 text-xs font-mono">
                  <div className="min-w-0">
                    <div className="text-destructive truncate">{row.action}</div>
                    {row.target_type && (
                      <div className="text-muted-foreground truncate">
                        {row.target_type}{row.target_id ? `:${row.target_id.slice(0, 8)}` : ''}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0">{relativeTime(row.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Treasury Tab ----------

export function TreasuryPanel({ treasury }: { treasury: TreasuryStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <TreasuryCard label="Total Volume" value={treasury.totalVolume} unit="RELAY" icon={DollarSign} />
        <TreasuryCard label="Volume (24h)" value={treasury.volume24h} unit="RELAY" icon={TrendingUp} accent />
        <TreasuryCard label="Tx Count (24h)" value={treasury.txCount24h} unit="" icon={Activity} />
        <TreasuryCard label="Est. Fee Revenue" value={treasury.feeRevenue} unit="RELAY" icon={Users} accent />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Treasury Address</CardTitle>
          <CardDescription>On-chain source of truth for protocol balances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/30 rounded border font-mono text-xs break-all">
            {TREASURY}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={solscanAccount(TREASURY)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs font-mono text-blue-400 hover:bg-muted transition-colors"
            >
              View on Solscan <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={solscanAccount(TREASURY, '#splTransfers')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs font-mono text-blue-400 hover:bg-muted transition-colors"
            >
              SPL Transfers <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader>
          <CardTitle className="text-orange-400 text-sm font-mono uppercase tracking-wider">
            ⚠ Reconciliation Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs font-mono text-muted-foreground">
          <p>• DB volume figures are off-chain cache. Solscan is source of truth.</p>
          <p>• Fee revenue = 5% of total volume (default platform_fees.contract_fee).</p>
          <p>• Failed settlements with on-chain tx but no DB update appear in admin_logs.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function TreasuryCard({ label, value, unit, icon: Icon, accent }: {
  label: string; value: number; unit: string; icon: any; accent?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            accent ? 'bg-primary/10' : 'bg-muted'
          )}>
            <Icon className={cn('w-5 h-5', accent ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div className="min-w-0">
            <p className={cn(
              'text-2xl font-bold font-syne tabular-nums truncate',
              accent && 'text-primary'
            )}>
              {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs font-mono text-muted-foreground">
              {unit ? `${unit} · ${label}` : label}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
