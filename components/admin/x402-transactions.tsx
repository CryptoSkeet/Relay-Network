'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, ExternalLink, AlertCircle, DollarSign, TrendingUp, Activity } from 'lucide-react'
import Link from 'next/link'

interface Tx {
  id: string
  agent_id: string | null
  agent_handle: string | null
  agent_display_name: string | null
  resource_url: string
  description: string | null
  amount_usdc: number
  tx_signature: string | null
  status: string
  created_at: string
}

interface Spender {
  agent_id: string
  handle: string | null
  display_name: string | null
  spent_usdc: number
}

interface Resp {
  success: boolean
  network: string
  aggregates: {
    total_count: number
    completed_count: number
    failed_count: number
    spent_24h: number
    spent_7d: number
    spent_total: number
  }
  top_spenders: Spender[]
  transactions: Tx[]
  error?: string
}

const fmt = (n: number) => `$${n.toFixed(2)}`
const ago = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function X402TransactionsPanel() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/x402-transactions?limit=200', { cache: 'no-store' })
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

  const agg = data?.aggregates
  const isMainnet = (data?.network ?? '').includes('mainnet')
  const txCluster = isMainnet ? '' : '?cluster=devnet'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            x402 Outbound Payments
            <Badge variant={isMainnet ? 'default' : 'secondary'} className="text-[10px] uppercase">
              {isMainnet ? 'Mainnet' : 'Devnet'}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">USDC spent by agents on external x402 paywalls</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1">
              <Activity className="w-3 h-3" /> 24h Spend
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(agg?.spent_24h ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 7d Spend
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(agg?.spent_7d ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Lifetime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{fmt(agg?.spent_total ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Tx Count</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">{agg?.completed_count ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">
              {agg?.failed_count ?? 0} failed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top spenders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Spenders</CardTitle>
          <CardDescription>Agents with highest cumulative x402 spend</CardDescription>
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
                  <span className="text-sm font-bold font-mono">{fmt(s.spent_usdc)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No outbound x402 spend yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
          <CardDescription>Last {data?.transactions.length ?? 0} x402 outbound payments</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data?.transactions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">When</th>
                    <th className="text-left p-3">Agent</th>
                    <th className="text-left p-3">Resource</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map(tx => (
                    <tr key={tx.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{ago(tx.created_at)}</td>
                      <td className="p-3">
                        {tx.agent_handle ? (
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
                        <Badge variant={tx.status === 'completed' ? 'default' : 'destructive'} className="text-[10px]">
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {tx.tx_signature ? (
                          <a
                            href={`https://solscan.io/tx/${tx.tx_signature}${txCluster}`}
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
            <p className="text-sm text-muted-foreground py-8 text-center">No outbound x402 transactions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
