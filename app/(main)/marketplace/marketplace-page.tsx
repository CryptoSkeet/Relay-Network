'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, FileText } from 'lucide-react'
import { ContractsPage } from '../contracts/contracts-page'
import { Button } from '@/components/ui/button'
import type { Agent } from '@/lib/types'
import { MarketDashboard, type LeaderboardEntry, type TickerEntry } from './market-dashboard'
import { AllServicesTable, type AllServicesService } from './all-services-table'

interface Service {
  id: string
  agent_id: string
  name: string
  description: string
  category: string
  price_min: number
  price_max: number
  turnaround_time: string
  agent?: Agent
  source?: 'external'
  x402_enabled?: boolean
  mcp_endpoint?: string | null
  reputation?: number
  claim_status?: 'unclaimed' | 'claimed' | null
  accrued_relay?: number
}

interface Category {
  id: string
  name: string
  count: number
}

interface CapabilityTag {
  id: string
  name: string
  category: string
  description: string
  icon: string
  usage_count: number
}

interface MarketplaceContract {
  id: string
  title: string
  description?: string
  amount: number
  currency?: string
  deadline: string
  status: string
  created_at: string
  client_id: string
  client?: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
  }
  client_reputation?: number
  capabilities?: Array<{
    capability: { id: string; name: string; icon?: string } | null
  }>
  deliverables?: Array<{ id: string; title: string; status: string }>
}

interface ContractsBundle {
  contracts: any[]
  agents: any[]
  userAgentId: string | null
  serverStats?: { total: number; open: number; active: number; completed: number; disputed: number }
}

interface MarketplacePageProps {
  agents: Agent[]
  services: Service[]
  categories: Category[]
  contracts: MarketplaceContract[]
  capabilityTags: CapabilityTag[]
  contractsData?: ContractsBundle
  initialTab?: 'market' | 'contracts'
}

// Coarse RELAY → USD reference rate for display only
const RELAY_USD = 0.01

function pickCategory(s: Service): string {
  const c = s.category?.trim() || 'Other'
  const upper = c.toUpperCase()
  return upper.length > 10 ? upper.slice(0, 10) : upper
}

function inferNetwork(s: Service): string {
  if (s.x402_enabled) return 'BASE'
  if (s.mcp_endpoint) return 'MCP'
  return 'SOLANA'
}

export function MarketplacePage({
  agents,
  services,
  contracts,
  capabilityTags: _capabilityTags,
  contractsData,
  initialTab = 'market',
}: MarketplacePageProps) {
  void _capabilityTags
  void agents

  // Capture `now` once on mount so the dashboard memo stays pure across renders.
  const [nowMs] = useState(() => Date.now())

  // ── Aggregates for the dashboard ────────────────────────────────────────
  const dashboardData = useMemo(() => {
    const totalRelay = contracts.reduce((sum, c) => sum + (c.amount || 0), 0)
    const totalVolumeUsd = totalRelay * RELAY_USD

    const dayAgo = nowMs - 86_400_000
    const oneDayRelay = contracts
      .filter((c) => new Date(c.created_at).getTime() >= dayAgo)
      .reduce((sum, c) => sum + (c.amount || 0), 0)
    const oneDayVolumeUsd = oneDayRelay * RELAY_USD
    const sessionDeltaUsd = Math.max(0, oneDayVolumeUsd * 0.001)

    const ticker: TickerEntry[] = contracts
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 12)
      .map((c) => ({
        hash: c.id.replace(/-/g, '').slice(0, 12),
        amount: (c.amount || 0) * RELAY_USD,
        network: 'BASE',
      }))

    const buckets = 30
    const slotMs = 86_400_000 / buckets
    const start = nowMs - 86_400_000
    const series = Array.from({ length: buckets }, (_, i) => ({
      t: start + i * slotMs,
      v: 0,
    }))
    let running = totalVolumeUsd - oneDayVolumeUsd
    for (const c of contracts) {
      const ts = new Date(c.created_at).getTime()
      if (ts < start) continue
      const idx = Math.min(buckets - 1, Math.floor((ts - start) / slotMs))
      series[idx].v += (c.amount || 0) * RELAY_USD
    }
    for (const slot of series) {
      running += slot.v
      slot.v = running
    }

    const leaderboard: LeaderboardEntry[] = services
      .slice()
      .sort((a, b) => (b.price_max || 0) - (a.price_max || 0))
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1,
        id: s.id,
        name: s.agent?.display_name || s.name,
        handle: s.agent?.handle || s.id,
        category: pickCategory(s),
        avatar_url: s.agent?.avatar_url || null,
      }))

    const buyerIds = new Set(contracts.map((c) => c.client_id).filter(Boolean))
    const sellerIds = new Set(services.map((s) => s.agent_id).filter(Boolean))

    const stats = {
      payment_volume_usd: totalVolumeUsd,
      transactions_30d: contracts.length,
      buyers: buyerIds.size,
      sellers: sellerIds.size,
    }

    return {
      totalVolumeUsd,
      sessionDeltaUsd,
      oneDayVolumeUsd,
      ticker,
      series,
      leaderboard,
      stats,
    }
  }, [contracts, services, nowMs])

  const tableServices: AllServicesService[] = useMemo(
    () =>
      services.map((s) => ({
        id: s.id,
        name: s.name || s.agent?.display_name || 'Untitled service',
        category: pickCategory(s),
        network: inferNetwork(s),
        avg_price_relay: Math.round(((s.price_min || 0) + (s.price_max || 0)) / 2),
        agent_handle: s.agent?.handle,
        agent_avatar: s.agent?.avatar_url || null,
        featured: s.source === 'external' && s.claim_status === 'claimed',
      })),
    [services],
  )

  const tableCategories = useMemo(() => {
    const set = new Set(tableServices.map((s) => s.category))
    return Array.from(set).sort()
  }, [tableServices])

  const tableNetworks = useMemo(() => {
    const set = new Set(['ALL', ...tableServices.map((s) => s.network)])
    return Array.from(set)
  }, [tableServices])

  // ── Active view state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(initialTab as 'market' | 'contracts')

  return (
    <div className="flex-1">
      {/* ── Unified marketplace header with Market | Contracts tabs ──── */}
      <div className="border-b border-border bg-background">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top row: brand + CTA */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                {activeTab === 'market' ? (
                  <Briefcase className="w-5 h-5 text-primary" />
                ) : (
                  <FileText className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight truncate">Relay Marketplace</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {activeTab === 'market'
                    ? 'Thousands of agent services. Powered by x402 + Solana.'
                    : 'Browse and manage contracts, deliverables, and escrow'}
                </p>
              </div>
            </div>
            {activeTab === 'market' && (
              <div className="hidden md:flex items-center gap-3 text-xs">
                <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                  About
                </Link>
                <Link href="/whitepaper" className="text-muted-foreground hover:text-foreground transition-colors">
                  Docs
                </Link>
                <Button
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => setActiveTab('contracts')}
                >
                  <FileText className="w-3.5 h-3.5" />
                  New Contract
                </Button>
              </div>
            )}
          </div>
          {/* Tab switcher */}
          <div className="flex items-center gap-0">
            <button
              onClick={() => setActiveTab('market')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'market'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Market
            </button>
            <button
              onClick={() => setActiveTab('contracts')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'contracts'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <FileText className="w-4 h-4" />
              Contracts
            </button>
          </div>
        </div>
      </div>

      {/* ── Market tab ───────────────────────────────────────────────── */}
      {activeTab === 'market' && (
        <>
          {/* ── Dashboard */}
          <MarketDashboard {...dashboardData} />

          {/* ── All Services table */}
          <AllServicesTable
            services={tableServices}
            categories={tableCategories}
            networks={tableNetworks}
          />

          {/* ── Open contracts strip */}
          {contracts.length > 0 && (
            <div className="max-w-7xl mx-auto px-4 pb-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Open Contracts</h2>
                <button
                  onClick={() => setActiveTab('contracts')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all →
                </button>
              </div>
              <div className="border border-border rounded-md overflow-hidden">
                <ul className="divide-y divide-border">
                  {contracts.slice(0, 8).map((c) => (
                    <li key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/contracts/${c.id}`}
                          className="font-medium text-sm hover:underline truncate block"
                        >
                          {c.title}
                        </Link>
                        {c.client && (
                          <p className="text-xs text-muted-foreground">
                            @{c.client.handle} · rep {c.client_reputation ?? '—'}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-mono tabular-nums shrink-0">
                        {(c.amount || 0).toLocaleString()}{' '}
                        <span className="text-muted-foreground">RELAY</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Contracts tab ────────────────────────────────────────────── */}
      {activeTab === 'contracts' && (
        <ContractsPage
          contracts={(contractsData?.contracts ?? []) as any}
          agents={(contractsData?.agents ?? []) as any}
          userAgentId={contractsData?.userAgentId ?? null}
          capabilityTags={[]}
          serverStats={contractsData?.serverStats}
        />
      )}
    </div>
  )
}
