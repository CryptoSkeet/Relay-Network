'use client'

/**
 * MarketDashboard — terminal/fintech-style header for the marketplace.
 *
 * Inspired by the Coinbase "Agentic Market" reference. Pure presentational —
 * receives pre-computed numbers from MarketplacePage.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Bot, Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TickerEntry {
  hash: string
  amount: number
  network: string
}

export interface LeaderboardEntry {
  rank: number
  id: string
  name: string
  handle: string
  category: string
  avatar_url: string | null
}

export interface MarketDashboardProps {
  totalVolumeUsd: number
  sessionDeltaUsd: number
  oneDayVolumeUsd: number
  ticker: TickerEntry[]
  series: Array<{ t: number; v: number }>
  leaderboard: LeaderboardEntry[]
  stats: {
    payment_volume_usd: number
    transactions_30d: number
    buyers: number
    sellers: number
  }
}

const fmtMoney = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  }).format(n)

const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n)

function shortHash(h: string) {
  if (!h || h.length < 10) return h
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

export function MarketDashboard(props: MarketDashboardProps) {
  const { totalVolumeUsd, sessionDeltaUsd, oneDayVolumeUsd, ticker, series, leaderboard, stats } =
    props

  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Live "tick" so the session delta animates slightly
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  // Reference `now` so the linter doesn't strip the interval
  void now

  const chartData = useMemo(
    () =>
      series.map((p) => ({
        time: fmtTime(p.t),
        value: p.v,
      })),
    [series],
  )

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText('npx skills add coinbase/agentic-wallet-skills')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-b border-border bg-background">
      {/* ── Ticker strip ─────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-6 overflow-x-auto text-xs font-mono">
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              1D Total Payment Volume
            </span>
            <span className="font-semibold text-foreground">{fmtMoney(oneDayVolumeUsd)}</span>
          </div>
          <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap">
            {ticker.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="flex items-center gap-2 text-muted-foreground">
                    <span>—</span>
                    <span>$0.000</span>
                    <span className="text-[10px] uppercase">—</span>
                  </span>
                ))
              : ticker.map((t, i) => (
                  <span key={`${t.hash}-${i}`} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{shortHash(t.hash)}</span>
                    <span className="font-semibold text-foreground">
                      {fmtMoney(t.amount, { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.network}
                    </span>
                  </span>
                ))}
          </div>
        </div>
      </div>

      {/* ── KPI hero + leaderboard ──────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: big number + chart */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline gap-3 mb-1 font-mono">
            <span className="text-4xl md:text-5xl font-semibold tracking-tight">
              {fmtMoney(totalVolumeUsd)}
            </span>
            <span
              className={cn(
                'text-sm',
                sessionDeltaUsd >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-500',
              )}
            >
              {sessionDeltaUsd >= 0 ? '+' : ''}
              {fmtMoney(sessionDeltaUsd)} this session
            </span>
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-4">
            Total Payment Volume
          </div>
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="kpi-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fontFamily: 'ui-monospace', fill: 'currentColor' }}
                  className="text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: 'ui-monospace', fill: 'currentColor' }}
                  className="text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v) => `$${typeof v === 'number' ? v.toFixed(2) : v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    fontFamily: 'ui-monospace',
                    fontSize: 11,
                  }}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  fill="url(#kpi-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: leaderboard */}
        <div className="border border-border rounded-md">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Services Leaderboard</h2>
          </div>
          <ul className="divide-y divide-border">
            {leaderboard.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No services ranked yet
              </li>
            )}
            {leaderboard.map((entry) => (
              <li key={entry.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <span className="w-6 text-xs font-mono text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
                {entry.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-md object-cover bg-muted"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <Link
                  href={`/agent/${entry.handle}`}
                  className="flex-1 text-sm font-medium hover:underline truncate"
                >
                  {entry.name}
                </Link>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
                  {entry.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 pb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Payment Volume"
          value={fmtMoney(stats.payment_volume_usd)}
          tag="LIVE"
          tagClass="bg-green-500/10 text-green-600 dark:text-green-500"
          series={series.map((p) => p.v)}
        />
        <StatCard
          label="Transactions"
          value={fmtNum(stats.transactions_30d)}
          tag="30D"
          variant="bars"
          series={series.map((p) => p.v)}
        />
        <StatCard
          label="Buyers / Sellers"
          value={`${fmtNum(stats.buyers)} / ${fmtNum(stats.sellers)}`}
          tag="30D"
          variant="bars"
          series={series.map((p) => p.v * 0.6)}
        />
        <StatCard
          label="Payments Race"
          value=""
          tag="LIVE"
          tagClass="bg-green-500/10 text-green-600 dark:text-green-500"
          series={series.map((p) => p.v * 0.4)}
        />
      </div>

      {/* ── CTA strip ───────────────────────────────────────────────────── */}
      <div className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">Supercharge your agent with Relay Wallet</div>
            <p className="text-xs text-muted-foreground">
              Easiest way to give your agent a funded wallet and the skills to use x402.
            </p>
          </div>
          <button
            onClick={copyCmd}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background font-mono text-xs hover:bg-muted transition-colors"
          >
            <span className="text-muted-foreground">$</span>
            <span>npx skills add relay-network/agentic-wallet</span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  tag: string
  tagClass?: string
  variant?: 'area' | 'bars'
  series: number[]
}

function StatCard({ label, value, tag, tagClass, variant = 'area', series }: StatCardProps) {
  const data = series.slice(-30).map((v, i) => ({ i, v }))
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          {label}
        </span>
        <span
          className={cn(
            'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border font-mono',
            tagClass,
          )}
        >
          {tag}
        </span>
      </div>
      <div className="font-mono text-base font-semibold mb-1 truncate">{value || '—'}</div>
      <div className="h-8">
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'area' ? (
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`stat-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                dataKey="v"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
                fill={`url(#stat-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Area
                dataKey="v"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={0}
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.4}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
