'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Wallet, Lock, Unlock, Clock, AlertTriangle, ArrowRight, Coins, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface EscrowTransaction {
  id: string
  contract_id: string
  contract_title?: string
  payer_id: string
  payee_id?: string
  amount: number
  currency: string
  status: 'locked' | 'pending_release' | 'released' | 'refunded' | 'disputed'
  locked_at: string
  released_at?: string
  release_tx_hash?: string
}

interface EscrowWalletProps {
  escrows: EscrowTransaction[]
  userAgentId: string
  className?: string
}

export function EscrowWallet({ escrows, userAgentId, className }: EscrowWalletProps) {
  const stats = useMemo(() => {
    let locked = 0
    let pending = 0
    let released = 0
    let disputed = 0

    escrows.forEach(e => {
      switch (e.status) {
        case 'locked':
          locked += e.amount
          break
        case 'pending_release':
          pending += e.amount
          break
        case 'released':
        case 'refunded':
          released += e.amount
          break
        case 'disputed':
          disputed += e.amount
          break
      }
    })

    return { locked, pending, released, disputed, total: locked + pending + disputed }
  }, [escrows])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'locked': return <Lock className="w-4 h-4 text-yellow-500" />
      case 'pending_release': return <Clock className="w-4 h-4 text-blue-500" />
      case 'released': return <Unlock className="w-4 h-4 text-green-500" />
      case 'refunded': return <Unlock className="w-4 h-4 text-orange-500" />
      case 'disputed': return <AlertTriangle className="w-4 h-4 text-red-500" />
      default: return <Coins className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'locked': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
      case 'pending_release': return 'bg-blue-500/10 text-blue-500 border-blue-500/30'
      case 'released': return 'bg-green-500/10 text-green-500 border-green-500/30'
      case 'refunded': return 'bg-orange-500/10 text-orange-500 border-orange-500/30'
      case 'disputed': return 'bg-red-500/10 text-red-500 border-red-500/30'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  // Separate incoming vs outgoing
  const incoming = escrows.filter(e => e.payee_id === userAgentId)
  const outgoing = escrows.filter(e => e.payer_id === userAgentId)

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Escrow Wallet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance Overview */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Total in Escrow</span>
            <span className="text-2xl font-bold text-primary">
              {stats.total.toLocaleString()} RELAY
            </span>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-yellow-500 mb-1">
                <Lock className="w-3 h-3" />
                <span className="text-xs">Locked</span>
              </div>
              <p className="font-semibold">{stats.locked.toLocaleString()}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                <Clock className="w-3 h-3" />
                <span className="text-xs">Pending</span>
              </div>
              <p className="font-semibold">{stats.pending.toLocaleString()}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs">Disputed</span>
              </div>
              <p className="font-semibold">{stats.disputed.toLocaleString()}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
                <Unlock className="w-3 h-3" />
                <span className="text-xs">Released</span>
              </div>
              <p className="font-semibold">{stats.released.toLocaleString()}</p>
            </div>
          </div>

          {/* Progress bar showing distribution */}
          {stats.total > 0 && (
            <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-muted">
              <div 
                className="bg-yellow-500 transition-all"
                style={{ width: `${(stats.locked / stats.total) * 100}%` }}
              />
              <div 
                className="bg-blue-500 transition-all"
                style={{ width: `${(stats.pending / stats.total) * 100}%` }}
              />
              <div 
                className="bg-red-500 transition-all"
                style={{ width: `${(stats.disputed / stats.total) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Recent Transactions</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {escrows.slice(0, 10).map(escrow => {
              const isIncoming = escrow.payee_id === userAgentId
              
              return (
                <div 
                  key={escrow.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(escrow.status)}
                    <div>
                      <p className="text-sm font-medium line-clamp-1">
                        {escrow.contract_title || `Contract ${escrow.contract_id.slice(0, 8)}...`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(escrow.locked_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'font-semibold',
                      isIncoming ? 'text-green-500' : 'text-muted-foreground'
                    )}>
                      {isIncoming ? '+' : ''}{escrow.amount.toLocaleString()} {escrow.currency}
                    </p>
                    <Badge variant="outline" className={cn('text-xs', getStatusColor(escrow.status))}>
                      {escrow.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              )
            })}

            {escrows.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No escrow transactions yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t">
          <Button variant="outline" className="w-full" asChild>
            <Link href="/contracts">
              View All Contracts
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
