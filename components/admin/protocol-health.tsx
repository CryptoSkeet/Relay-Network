'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Activity, Users, DollarSign, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  AdminMetrics, EngineHealth, FunnelStep, NorthStarMetrics, TreasuryStats,
} from '@/lib/admin/metrics'

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
            solscan={`https://solscan.io/account/${TREASURY}`}
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

// ---------- Error Monitor (known errors from Datadog) ----------

const KNOWN_ERRORS = [
  { route: 'POST /rest/v1/bids', code: 400, priority: 'CRITICAL', status: 'fixed', fix: 'Wrong column name (amount → proposed_price). Fixed Apr 19.' },
  { route: 'PATCH /rest/v1/contracts (settle)', code: 400, priority: 'CRITICAL', status: 'fixed', fix: '.single() → .maybeSingle() with idempotent guard.' },
  { route: 'GET /rest/v1/contract_activity_log', code: 404, priority: 'HIGH', status: 'mitigated', fix: 'Wrapped in try/catch; pending migration apply.' },
  { route: 'GET /rest/v1/posts (order=like_count)', code: 500, priority: 'HIGH', status: 'fixed', fix: 'Removed SQL order; client-side sort fallback.' },
  { route: 'POST /rest/v1/conversations', code: 400, priority: 'MEDIUM', status: 'fixed', fix: 'Unique-violation race handler returns existing conv.' },
  { route: 'GET /rest/v1/agents (single)', code: 406, priority: 'MEDIUM', status: 'fixed', fix: '.single() → .maybeSingle() across follows/chat.' },
  { route: 'GET /rest/v1/stakes', code: 404, priority: 'LOW', status: 'fixed', fix: 'Promise.allSettled tolerant fallback in wallet.' },
  { route: 'GET /rest/v1/wallets (join)', code: 400, priority: 'LOW', status: 'fixed', fix: 'Dropped non-FK client_id join in wallet page.' },
] as const

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  CRITICAL: 'destructive', HIGH: 'destructive', MEDIUM: 'default', LOW: 'secondary',
}

const STATUS_TONE: Record<string, string> = {
  fixed: 'text-primary',
  mitigated: 'text-orange-400',
  open: 'text-destructive',
}

function ErrorMonitor() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Error Monitor</span>
          <Badge variant="outline" className="font-mono text-xs">
            {KNOWN_ERRORS.filter(e => e.status === 'fixed').length}/{KNOWN_ERRORS.length} resolved
          </Badge>
        </CardTitle>
        <CardDescription>Top production errors from Datadog (last 7 days)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {KNOWN_ERRORS.map(err => (
            <div key={err.route}
              className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                <span className="text-xs font-mono">{err.route}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={PRIORITY_VARIANT[err.priority]} className="text-xs">
                    {err.priority}
                  </Badge>
                  <span className="text-xs font-mono text-destructive">{err.code}</span>
                  <span className={cn('text-xs font-mono uppercase', STATUS_TONE[err.status])}>
                    {err.status}
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{err.fix}</p>
            </div>
          ))}
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
              href={`https://solscan.io/account/${TREASURY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs font-mono text-blue-400 hover:bg-muted transition-colors"
            >
              View on Solscan <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`https://solscan.io/account/${TREASURY}#splTransfers`}
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
