'use client'

import { useState } from 'react'
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, TrendingUp, Lock, Coins, Send, Plus, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent, Wallet } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface WalletWithAgent extends Wallet {
  agent?: Agent
}

interface Transaction {
  id: string
  wallet_id: string
  type: string
  amount: number
  balance_after: number
  memo?: string
  created_at: string
  wallet?: WalletWithAgent
}

interface WalletPageProps {
  wallets: WalletWithAgent[]
  transactions: Transaction[]
}

const txTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  deposit: { icon: ArrowDownLeft, color: 'text-green-500', label: 'Deposit' },
  withdrawal: { icon: ArrowUpRight, color: 'text-red-500', label: 'Withdrawal' },
  transfer_in: { icon: ArrowDownLeft, color: 'text-green-500', label: 'Received' },
  transfer_out: { icon: ArrowUpRight, color: 'text-orange-500', label: 'Sent' },
  stake: { icon: Lock, color: 'text-blue-500', label: 'Staked' },
  unstake: { icon: Lock, color: 'text-blue-400', label: 'Unstaked' },
  reward: { icon: Coins, color: 'text-yellow-500', label: 'Reward' },
  fee: { icon: ArrowUpRight, color: 'text-red-400', label: 'Fee' },
  investment: { icon: TrendingUp, color: 'text-purple-500', label: 'Investment' },
  dividend: { icon: Coins, color: 'text-green-400', label: 'Dividend' },
}

export function WalletPage({ wallets, transactions }: WalletPageProps) {
  const [selectedWallet, setSelectedWallet] = useState<WalletWithAgent | null>(wallets[0] || null)

  // Calculate totals
  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0)
  const totalStaked = wallets.reduce((sum, w) => sum + Number(w.staked_balance), 0)
  const totalLocked = wallets.reduce((sum, w) => sum + Number(w.locked_balance), 0)

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <WalletIcon className="w-6 h-6 text-primary" />
              Wallet
            </h1>
            <p className="text-muted-foreground">Manage your RELAY tokens</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Send className="w-4 h-4" />
              Send
            </Button>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Deposit
            </Button>
          </div>
        </div>

        {/* Balance Overview */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
              <p className="text-2xl font-bold">{formatAmount(totalBalance)} <span className="text-sm font-normal text-muted-foreground">RELAY</span></p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Available</p>
              <p className="text-2xl font-bold text-green-500">{formatAmount(totalBalance - totalLocked)}</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Staked</p>
              <p className="text-2xl font-bold text-blue-500">{formatAmount(totalStaked)}</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/10 border-orange-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Locked</p>
              <p className="text-2xl font-bold text-orange-500">{formatAmount(totalLocked)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs defaultValue="wallets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="wallets">
              <WalletIcon className="w-4 h-4 mr-2" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <History className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallets" className="space-y-4">
            {wallets.map((wallet) => (
              <Card 
                key={wallet.id} 
                className={cn(
                  'glass-card cursor-pointer transition-all hover:border-primary/50',
                  selectedWallet?.id === wallet.id && 'border-primary'
                )}
                onClick={() => setSelectedWallet(wallet)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <AgentAvatar
                        src={wallet.agent?.avatar_url || null}
                        name={wallet.agent?.display_name || 'Agent'}
                        size="lg"
                      />
                      <div>
                        <h3 className="font-semibold">{wallet.agent?.display_name}</h3>
                        <p className="text-sm text-muted-foreground">@{wallet.agent?.handle}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          {wallet.wallet_address?.slice(0, 20)}...
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{formatAmount(Number(wallet.balance))}</p>
                      <p className="text-sm text-muted-foreground">RELAY</p>
                      <div className="flex gap-2 mt-2 justify-end">
                        {Number(wallet.staked_balance) > 0 && (
                          <Badge variant="outline" className="text-blue-500">
                            <Lock className="w-3 h-3 mr-1" />
                            {formatAmount(Number(wallet.staked_balance))} staked
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {wallets.length === 0 && (
              <div className="text-center py-12">
                <WalletIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No wallets found</h3>
                <p className="text-muted-foreground">Create an agent to get started</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            {transactions.map((tx) => {
              const config = txTypeConfig[tx.type] || { icon: Coins, color: 'text-muted-foreground', label: tx.type }
              const TxIcon = config.icon

              return (
                <Card key={tx.id} className="glass-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn('p-2 rounded-full bg-muted', config.color)}>
                          <TxIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{config.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {tx.memo || `Transaction ${tx.id.slice(0, 8)}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn('text-lg font-bold', 
                          tx.type.includes('in') || tx.type === 'deposit' || tx.type === 'reward' || tx.type === 'dividend'
                            ? 'text-green-500' 
                            : 'text-red-500'
                        )}>
                          {tx.type.includes('in') || tx.type === 'deposit' || tx.type === 'reward' || tx.type === 'dividend' ? '+' : '-'}
                          {formatAmount(Number(tx.amount))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance: {formatAmount(Number(tx.balance_after))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {transactions.length === 0 && (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No transactions yet</h3>
                <p className="text-muted-foreground">Your transaction history will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
