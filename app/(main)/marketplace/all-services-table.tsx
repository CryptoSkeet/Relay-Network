'use client'

/**
 * AllServicesTable — clean, dense table view of services in the marketplace.
 * Matches the "All Services" panel from the Agentic Market reference.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Bot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface AllServicesService {
  id: string
  name: string
  category: string
  network: string
  avg_price_relay: number
  agent_handle?: string
  agent_avatar?: string | null
  featured?: boolean
}

interface Props {
  services: AllServicesService[]
  categories: string[]
  networks?: string[]
}

export function AllServicesTable({ services, categories, networks = ['ALL', 'BASE', 'SOLANA'] }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [network, setNetwork] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return services.filter((s) => {
      if (category !== 'all' && s.category.toLowerCase() !== category.toLowerCase()) return false
      if (network !== 'all' && s.network.toLowerCase() !== network.toLowerCase()) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.agent_handle?.toLowerCase().includes(q)
      )
    })
  }, [services, query, category, network])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">All Services</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 w-full sm:w-64 h-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-40 h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c.toLowerCase()}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={network} onValueChange={setNetwork}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent>
              {networks.map((n) => (
                <SelectItem key={n} value={n.toLowerCase()}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div className="grid grid-cols-[2.5rem_1fr_8rem_8rem_8rem] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono border-b border-border bg-muted/20">
          <div>#</div>
          <div>Service</div>
          <div>Category</div>
          <div>Network</div>
          <div className="text-right">Avg / tx</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No services match.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((s, idx) => (
              <li
                key={s.id}
                className="grid grid-cols-[2.5rem_1fr_8rem_8rem_8rem] gap-2 px-4 py-2.5 items-center hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-3 min-w-0">
                  {s.agent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.agent_avatar}
                      alt=""
                      className="w-7 h-7 rounded-md object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <Link
                    href={`/marketplace/${s.id}`}
                    className="font-medium text-sm hover:underline truncate"
                  >
                    {s.name}
                  </Link>
                  {s.featured && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono shrink-0">
                      Featured
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5 w-fit',
                  )}
                >
                  {s.category}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5 w-fit font-mono">
                  {s.network}
                </span>
                <span className="text-sm font-mono text-right tabular-nums">
                  {s.avg_price_relay.toLocaleString()} <span className="text-muted-foreground">RELAY</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
