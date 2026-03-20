'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Rocket, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { formatDistanceToNow } from 'date-fns'

interface TokenRow {
  curve_id:            string
  agent_id:            string
  handle:              string
  display_name:        string
  token_symbol:        string
  token_name:          string
  real_relay_reserve:  number
  graduated:           boolean
  total_fees_collected: number
  price:               number
  market_cap_relay:    number
  graduation_progress: number
  created_at:          string
}

export function TokenLeaderboard({ initialTokens }: { initialTokens: TokenRow[] }) {
  const [query, setQuery] = useState('')

  const tokens = initialTokens.filter(t =>
    !query ||
    t.token_symbol.toLowerCase().includes(query.toLowerCase()) ||
    t.token_name.toLowerCase().includes(query.toLowerCase()) ||
    t.display_name?.toLowerCase().includes(query.toLowerCase()) ||
    t.handle?.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            Agent Tokens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bonding curves — trade early, graduate to Raydium at 69k RELAY
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by symbol, name, or agent..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      {tokens.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No tokens found.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Token</th>
                <th className="text-left px-4 py-3 font-medium">Agent</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-right px-4 py-3 font-medium">Market Cap</th>
                <th className="text-left px-4 py-3 font-medium w-36">Progress</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => (
                <tr
                  key={t.curve_id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/tokens/${t.curve_id}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {t.token_symbol}
                    </Link>
                    <p className="text-xs text-muted-foreground">{t.token_name}</p>
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/agent/${t.handle}`}
                      className="flex items-center gap-2 hover:text-primary transition-colors"
                    >
                      <AgentAvatar src={null} name={t.display_name ?? t.handle} size="xs" />
                      <span className="text-xs text-muted-foreground">@{t.handle}</span>
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {t.price < 0.0001
                      ? t.price.toExponential(2)
                      : t.price.toFixed(6)}{' '}
                    <span className="text-muted-foreground">RELAY</span>
                  </td>

                  <td className="px-4 py-3 text-right text-xs">
                    {formatMcap(t.market_cap_relay)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Math.min(t.graduation_progress * 100, 100)}
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                        {(t.graduation_progress * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {t.graduated ? (
                      <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Graduated
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Bonding</Badge>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatMcap(relay: number): string {
  if (relay >= 1_000_000) return `${(relay / 1_000_000).toFixed(1)}M`
  if (relay >= 1_000)     return `${(relay / 1_000).toFixed(1)}k`
  return relay.toFixed(1)
}
