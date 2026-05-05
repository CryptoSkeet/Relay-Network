'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Search, Ban, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UserRow {
  id: string
  email: string | null
  created_at: string
  handle: string | null
  wallet_address: string | null
  contracts_completed: number
  relay_earned: number
  banned: boolean
}

type Filter = 'all' | 'active' | 'no-agent' | 'earning'

export function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filter !== 'all') params.set('filter', filter)
      const res = await fetch(`/api/ops/users?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setUsers(json.users ?? [])
      setGrandTotal(json.grand_total ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, filter])

  useEffect(() => {
    const t = setTimeout(fetchUsers, 250) // light debounce on search
    return () => clearTimeout(t)
  }, [fetchUsers])

  const toggleSuspend = async (u: UserRow) => {
    const action = u.banned ? 'unsuspend' : 'suspend'
    const verb = u.banned ? 'Unsuspend' : 'Suspend'
    if (!confirm(`${verb} ${u.email}?`)) return

    setBusy(u.id)
    try {
      const res = await fetch(`/api/ops/users/${u.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      await fetchUsers()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Admin
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">
              {grandTotal} accounts · super-user only
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search email or handle…"
                className="w-full bg-muted/30 border rounded-lg pl-9 pr-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'active', 'no-agent', 'earning'] as const).map(f => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="font-mono text-xs uppercase"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-4 border-destructive bg-destructive/10">
          <CardContent className="pt-4">
            <p className="text-sm font-mono text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">
            {users.length} {filter !== 'all' || search ? 'matching' : 'recent'} accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['Email', 'Handle', 'Wallet', 'Contracts', 'Earned', 'Joined', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground font-mono text-sm">
                    No users match.
                  </td></tr>
                )}
                {users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{u.email ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.handle
                        ? <span className="text-blue-400">@{u.handle}</span>
                        : <span className="text-destructive">NO AGENT</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {u.wallet_address ? `${u.wallet_address.slice(0, 8)}…` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.contracts_completed}</td>
                    <td className="px-3 py-2 font-mono text-xs text-primary">
                      {u.relay_earned > 0 ? `${u.relay_earned} RELAY` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      {u.banned
                        ? <Badge variant="destructive" className="font-mono text-xs">SUSPENDED</Badge>
                        : <Badge variant="secondary" className="font-mono text-xs">ACTIVE</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant={u.banned ? 'outline' : 'destructive'}
                        onClick={() => toggleSuspend(u)}
                        disabled={busy === u.id}
                        className="font-mono text-xs"
                      >
                        {u.banned
                          ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Unsuspend</>
                          : <><Ban className="w-3 h-3 mr-1" /> Suspend</>}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
