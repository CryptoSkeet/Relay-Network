'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, RefreshCw, ExternalLink, AlertCircle, DollarSign, TrendingUp, Activity, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

interface Tx {
  id: string
  agent_id: string | null
  agent_handle: string | null
  agent_display_name: string | null
  direction: 'inbound' | 'outbound' | null
  network: string | null
  resource_url: string
  description: string | null
  amount_usdc: number
  tx_signature: string | null
  payer_address: string | null
  pay_to_address: string | null
  facilitator: string | null
  status: string
  created_at: string
}

interface Spender {
  agent_id: string
  handle: string | null
  display_name: string | null
  spent_usdc: number
}

interface Resource {
  resource_url: string
  count: number
  revenue: number
}

interface Resp {
  success: boolean
  network: string
  aggregates: {
    inbound:  { count: number; revenue_24h: number; revenue_7d: number; revenue_total: number }
    outbound: { count: number; spent_24h: number; spent_7d: number; spent_total: number }
  }
  top_spenders: Spender[]
  top_resources: Resource[]
  transactions: Tx[]
  error?: string
}

const fmt = (n: number) => `$${n.toFixed(4)}`
const fmtBig = (n: number) => `$${n.toFixed(2)}`
const ago = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function solscanTxUrl(sig: string, network: string | null): string {
  const isMainnet = (network ?? '').includes('mainnet')
  return `https://solscan.io/tx/${sig}${isMainnet ? '' : '?cluster=devnet'}`
}

function shortAddr(a: string | null): string {
  if (!a) return '—'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

export function X402TransactionsPanel() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/x402-transactions?limit=300', { cache: 'no-store' })
      const json: Resp = await res.json()
      setData(json)
    } catch (err: any) {
      setData({ success: false, error: err.message } as Resp)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading x402 activity…</span>
        </CardContent>
      </Card>
    )
  }

  if (data?.error) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center text-destructive">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="text-sm">{data.error}</span>
        </CardContent>
      </Card>
    )
  }

  const inbound = (data?.transactions ?? []).filter(t => t.direction === 'inbound')
  const outbound = (data?.transactions ?? []).filter(t => t.direction !== 'inbound')
  const inboundAgg = data?.aggregates.inbound
  const outboundAgg = data?.aggregates.outbound

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">x402 Activity</h2>
          <p className="text-sm text-muted-foreground">
            USDC payments through Relay's paywall (inbound) and from agents to external paywalls (outbound)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top-line aggregates */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1 text-emerald-400">
              <ArrowDownLeft className="w-3 h-3" /> Revenue 24h
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmtBig(inboundAgg?.revenue_24h ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1 text-emerald-400">
              <TrendingUp className="w-3 h-3" /> Revenue Lifetime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmtBig(inboundAgg?.revenue_total ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{inboundAgg?.count ?? 0} payments</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1 text-amber-400">
              <ArrowUpRight className="w-3 h-3" /> Outbound 24h
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmtBig(outboundAgg?.spent_24h ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1 text-amber-400">
              <DollarSign className="w-3 h-3" /> Outbound Lifetime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmtBig(outboundAgg?.spent_total ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{outboundAgg?.count ?? 0} payments</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inbound" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <ArrowDownLeft className="w-4 h-4" /> Inbound Revenue
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4" /> Outbound Spend
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Earning Endpoints</CardTitle>
              <CardDescription>x402 paywalled endpoints ranked by lifetime USDC revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.top_resources.length ? (
                <div className="space-y-2">
                  {data.top_resources.map((r, idx) => (
                    <div key={r.resource_url} className="flex items-center justify-between p-2 rounded border bg-secondary/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-muted-foreground font-mono w-5">#{idx + 1}</span>
                        <span className="text-sm font-mono truncate" title={r.resource_url}>
                          {new URL(r.resource_url).pathname}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold font-mono">{fmtBig(r.revenue)}</span>
                        <span className="text-xs text-muted-foreground ml-2">{r.count} calls</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No inbound revenue yet.</p>
              )}
            </CardContent>
          </Card>

          <TxTable rows={inbound} mode="inbound" />
        </TabsContent>

        <TabsContent value="outbound" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Spending Agents</CardTitle>
              <CardDescription>Agents ranked by lifetime outbound x402 spend</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.top_spenders.length ? (
                <div className="space-y-2">
                  {data.top_spenders.map((s, idx) => (
                    <div key={s.agent_id} className="flex items-center justify-between p-2 rounded border bg-secondary/20">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono w-5">#{idx + 1}</span>
                        {s.handle ? (
                          <Link href={`/agent/${s.handle}`} className="text-sm font-medium hover:text-primary">
                            @{s.handle}
                          </Link>
                        ) : (
                          <span className="text-sm font-mono text-muted-foreground">{s.agent_id.slice(0, 8)}…</span>
                        )}
                      </div>
                      <span className="text-sm font-bold font-mono">{fmtBig(s.spent_usdc)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No outbound spend yet.</p>
              )}
            </CardContent>
          </Card>

          <TxTable rows={outbound} mode="outbound" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TxTable({ rows, mode }: { rows: Tx[]; mode: 'inbound' | 'outbound' }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Recent {mode === 'inbound' ? 'Inbound Payments' : 'Outbound Spend'}
        </CardTitle>
        <CardDescription>{rows.length} records</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">{mode === 'inbound' ? 'Payer' : 'Agent'}</th>
                  <th className="text-left p-3">{mode === 'inbound' ? 'Endpoint' : 'Resource'}</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Net</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(tx => (
                  <tr key={tx.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{ago(tx.created_at)}</td>
                    <td className="p-3">
                      {mode === 'inbound' ? (
                        <span className="font-mono text-xs" title={tx.payer_address ?? ''}>
                          {shortAddr(tx.payer_address)}
                        </span>
                      ) : tx.agent_handle ? (
                        <Link href={`/agent/${tx.agent_handle}`} className="text-primary hover:underline">
                          @{tx.agent_handle}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {tx.agent_id?.slice(0, 8) ?? '—'}…
                        </span>
                      )}
                    </td>
                    <td className="p-3 max-w-[280px] truncate" title={tx.resource_url}>
                      {tx.description || tx.resource_url}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{fmt(Number(tx.amount_usdc))}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">
                        {(tx.network ?? '').includes('mainnet') ? 'mainnet' : (tx.network ?? '—').replace('solana:', '')}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={tx.status === 'completed' ? 'default' : 'destructive'} className="text-[10px]">
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {tx.tx_signature ? (
                        <a
                          href={solscanTxUrl(tx.tx_signature, tx.network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline inline-flex items-center gap-1 text-xs font-mono"
                        >
                          {tx.tx_signature.slice(0, 8)}…
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No {mode} x402 transactions yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
