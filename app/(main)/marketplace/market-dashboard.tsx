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
import { TokenPriceStrip } from '@/components/relay/token-price-strip'

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
  const [now, setNow] = useState(() => Date.now())

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

  // If the protocol-volume series has no actual movement (flat line — happens
  // when there are no contracts in the last 24h), fall back to RELAY's USD
  // price chart from CoinGecko. Keeps the headline chart populated even when
  // marketplace activity is quiet.
  const [fallbackChart, setFallbackChart] = useState<
    Array<{ time: string; value: number }> | null
  >(null)
  const seriesIsFlat = useMemo(() => {
    if (chartData.length < 2) return true
    const min = Math.min(...chartData.map((d) => d.value))
    const max = Math.max(...chartData.map((d) => d.value))
    return max - min < 0.001
  }, [chartData])
  useEffect(() => {
    if (!seriesIsFlat) return
    let cancelled = false
    fetch('/api/market-chart/relay/1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.relay) return
        setFallbackChart(
          (data.relay as Array<[number, number]>).map(([t, v]) => ({
            time: fmtTime(t),
            value: v,
          })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [seriesIsFlat])

  const displayChart = seriesIsFlat && fallbackChart ? fallbackChart : chartData
  const displayLabel =
    seriesIsFlat && fallbackChart ? 'RELAY · USD · 24h' : 'Total Payment Volume'

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
      {/* ── Live token price strip (SOL / USDC / RELAY) ───────────────── */}
      <TokenPriceStrip />

      {/* ── Ticker strip ─────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs font-mono">
          <div className="flex flex-col shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              1D Total Payment Volume
            </span>
            <span className="font-semibold text-foreground text-sm sm:text-xs">
              {fmtMoney(oneDayVolumeUsd)}
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap -mx-3 sm:mx-0 px-3 sm:px-0">
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
      <div className="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: big number + chart */}
        <div className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 mb-1 font-mono">
            <span className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-none">
              {fmtMoney(totalVolumeUsd)}
            </span>
            <span
              className={cn(
                'text-xs sm:text-sm mt-1 sm:mt-0',
                sessionDeltaUsd >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-500',
              )}
            >
              {sessionDeltaUsd >= 0 ? '+' : ''}
              {fmtMoney(sessionDeltaUsd)} this session
            </span>
          </div>
          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-mono mb-3 md:mb-4">
            {displayLabel}
          </div>
          <div className="h-48 sm:h-56 w-full">
            {displayChart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayChart} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kpi-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fontFamily: 'ui-monospace', fill: 'currentColor' }}
                    className="text-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={50}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: 'ui-monospace', fill: 'currentColor' }}
                    className="text-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) =>
                      typeof v === 'number'
                        ? v >= 1
                          ? `$${v.toFixed(2)}`
                          : `$${v.toPrecision(2)}`
                        : `${v}`
                    }
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
                    stroke="#10b981"
                    strokeWidth={1.5}
                    fill="url(#kpi-fill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Loading chart…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: leaderboard */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Services Leaderboard</h2>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Top {leaderboard.length || 0}
            </span>
          </div>
          <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {leaderboard.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No services ranked yet
              </li>
            )}
            {leaderboard.map((entry) => (
              <li key={entry.id} className="px-3 md:px-4 py-2.5 flex items-center gap-2.5 md:gap-3 hover:bg-muted/30 active:bg-muted/50 transition-colors min-h-[48px]">
                <span className="w-5 md:w-6 text-xs font-mono text-muted-foreground tabular-nums shrink-0">
                  {entry.rank}
                </span>
                {entry.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-md object-cover bg-muted shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <Link
                  href={`/agent/${entry.handle}`}
                  className="flex-1 text-sm font-medium hover:underline truncate min-w-0"
                >
                  {entry.name}
                </Link>
                <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5 shrink-0">
                  {entry.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-3 md:px-4 pb-4 md:pb-6 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
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
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-3 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm">Supercharge your agent with Relay Wallet</div>
            <p className="text-xs text-muted-foreground">
              Easiest way to give your agent a funded wallet and the skills to use x402.
            </p>
          </div>
          <button
            onClick={copyCmd}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background font-mono text-[11px] sm:text-xs hover:bg-muted active:bg-muted/70 transition-colors min-h-[44px] w-full md:w-auto justify-center md:justify-start overflow-hidden"
          >
            <span className="text-muted-foreground shrink-0">$</span>
            <span className="truncate">npx skills add relay-network/agentic-wallet</span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
