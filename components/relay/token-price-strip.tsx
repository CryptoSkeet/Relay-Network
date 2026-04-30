'use client'

/**
 * TokenPriceStrip — live SOL / USDC / RELAY tiles with mini sparklines.
 *
 * Fetches current prices every 60s and 24h sparkline data every 5 minutes.
 * All proxied through Vercel rewrites → Railway → CoinGecko.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PriceData {
  usd?: number
  usd_market_cap?: number
  usd_24h_vol?: number
  usd_24h_change?: number
}

type Prices = Record<string, PriceData | undefined>
type Charts = Record<string, Array<[number, number]>>

const TOKENS = [
  { id: 'solana', ticker: 'SOL', icon: '◎', strokeUp: '#10b981', strokeDown: '#ef4444' },
  { id: 'usd-coin', ticker: 'USDC', icon: '$', strokeUp: '#3b82f6', strokeDown: '#f59e0b' },
  { id: 'relay', ticker: 'RELAY', icon: '⚡', strokeUp: '#f59e0b', strokeDown: '#ef4444' },
] as const

const LS_PRICES_KEY = 'relay:prices:v1'
const LS_CHARTS_KEY = 'relay:charts:v1'
const LS_TTL_MS = 10 * 60_000 // 10min — only used to skip very stale entries

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; data: T }
    if (!parsed?.ts || Date.now() - parsed.ts > LS_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    /* quota / private mode — ignore */
  }
}

function fmtUsd(n?: number) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toPrecision(3)}`
}

function fmtCompact(n?: number) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function TokenPriceStrip() {
  // Lazy-init from localStorage so the very first paint already has values
  // on repeat visits (no waiting for the network round-trip).
  const [prices, setPrices] = useState<Prices>(
    () => readCache<Prices>(LS_PRICES_KEY) ?? {},
  )
  const [charts, setCharts] = useState<Charts>(
    () => readCache<Charts>(LS_CHARTS_KEY) ?? {},
  )
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Prices (every 60s)
  useEffect(() => {
    const ids = TOKENS.map((t) => t.id).join(',')
    const fetchPrices = async () => {
      try {
        // Allow browser + CDN cache; backend sends s-maxage=30, swr=120.
        const res = await fetch(`/api/prices/${ids}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as Prices
        if (mounted.current) {
          setPrices(data)
          setError(null)
          writeCache(LS_PRICES_KEY, data)
        }
      } catch (e) {
        if (mounted.current) setError((e as Error).message)
      }
    }
    fetchPrices()
    const id = setInterval(fetchPrices, 60_000)
    return () => clearInterval(id)
  }, [])

  // Sparklines (every 5 min — chart data is more expensive on CG)
  useEffect(() => {
    const ids = TOKENS.map((t) => t.id).join(',')
    const fetchCharts = async () => {
      try {
        // Allow browser + CDN cache; backend sends s-maxage=300, swr=900.
        const res = await fetch(`/api/market-chart/${ids}/1`)
        if (!res.ok) return
        const data = (await res.json()) as Charts
        if (mounted.current) {
          setCharts(data)
          writeCache(LS_CHARTS_KEY, data)
        }
      } catch {
        /* silently degrade — sparkline is decorative */
      }
    }
    fetchCharts()
    const id = setInterval(fetchCharts, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="border-b border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
        {TOKENS.map(({ id, ticker, icon, strokeUp, strokeDown }) => (
          <PriceTile
            key={id}
            ticker={ticker}
            icon={icon}
            price={prices[id]}
            chart={charts[id]}
            strokeUp={strokeUp}
            strokeDown={strokeDown}
            error={error}
          />
        ))}
      </div>
    </div>
  )
}

function PriceTile({
  ticker,
  icon,
  price,
  chart,
  strokeUp,
  strokeDown,
  error,
}: {
  ticker: string
  icon: string
  price?: PriceData
  chart?: Array<[number, number]>
  strokeUp: string
  strokeDown: string
  error: string | null
}) {
  const change = price?.usd_24h_change
  const isUp = typeof change === 'number' && change >= 0
  const stroke = isUp ? strokeUp : strokeDown

  const sparkData = useMemo(
    () => (chart ?? []).map(([t, v]) => ({ t, v })),
    [chart],
  )

  return (
    <div
      className={cn(
        'relative bg-card border border-border rounded-lg overflow-hidden',
        'px-3 py-2.5 md:px-4 md:py-3',
        'flex items-center gap-3',
        'transition-colors hover:border-foreground/30',
        'min-h-[64px]',
      )}
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-muted/40 border border-border flex items-center justify-center text-base font-mono shrink-0">
        {icon}
      </div>

      {/* Ticker + price */}
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono leading-none">
          {ticker}
        </span>
        <span className="text-base md:text-lg font-semibold tabular-nums leading-tight mt-0.5">
          {fmtUsd(price?.usd)}
        </span>
      </div>

      {/* Sparkline (fills middle, mobile-shown) */}
      <div className="flex-1 h-10 min-w-[60px] hidden sm:block">
        {sparkData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`spark-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={stroke}
                strokeWidth={1.5}
                fill={`url(#spark-${ticker})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full opacity-30 bg-gradient-to-r from-transparent via-border to-transparent rounded" />
        )}
      </div>

      {/* 24h change */}
      <div
        className={cn(
          'shrink-0 inline-flex items-center gap-1 text-[11px] md:text-xs font-semibold px-2 py-1 rounded-md tabular-nums',
          typeof change !== 'number'
            ? 'text-muted-foreground bg-muted/30'
            : isUp
              ? 'text-emerald-500 bg-emerald-500/10'
              : 'text-red-500 bg-red-500/10',
        )}
      >
        {typeof change === 'number' && (isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
        {typeof change === 'number'
          ? `${isUp ? '+' : ''}${change.toFixed(2)}%`
          : error
            ? '—'
            : '…'}
      </div>
    </div>
  )
}
