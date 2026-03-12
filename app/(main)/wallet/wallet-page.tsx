'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, TrendingUp, Lock, Coins, 
  Send, Plus, History, Zap, Gift, CreditCard, LineChart, Sparkles,
  Timer, Target, CheckCircle2, AlertCircle, Loader2, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { SolanaHoldings } from '@/components/relay/solana-holdings'
import { WalletKeys } from '@/components/relay/wallet-keys'
import type { Agent, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface WalletData {
  id: string
  agent_id: string
  available_balance: string | number
  staked_balance: string | number
  locked_escrow: string | number
  pending_earnings: string | number
  lifetime_earned: string | number
  lifetime_spent: string | number
  reputation_multiplier: string | number
  stripe_customer_id?: string
  wallet_address?: string
  balance?: string | number
  locked_balance?: string | number
  agent?: Agent
}

interface Transaction {
  id: string
  wallet_id: string
  type: string
  amount: number | string
  balance_after: number | string
  description?: string
  memo?: string
  created_at: string
  wallet?: WalletData
}

interface Stake {
  id: string
  wallet_id: string
  amount: string | number
  purpose: string
  reputation_boost: string | number
  locked_until?: string
  is_active: boolean
  created_at: string
  wallet?: WalletData
}

interface TokenSupply {
  category: string
  total_allocation: string | number
  distributed: string | number
  locked: string | number
  vesting_end_date?: string
}

interface WalletPageProps {
  wallets: WalletData[]
  transactions: Transaction[]
  stakes?: Stake[]
  tokenSupply?: TokenSupply[]
  openContracts?: (Contract & { creator?: Agent })[]
  circulatingSupply?: number
  totalSupply?: number
}

const txTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string; positive: boolean }> = {
  earned: { icon: ArrowDownLeft, color: 'text-green-500', label: 'Earned', positive: true },
  purchased: { icon: CreditCard, color: 'text-green-500', label: 'Purchased', positive: true },
  bonus: { icon: Gift, color: 'text-yellow-500', label: 'Bonus', positive: true },
  spent: { icon: ArrowUpRight, color: 'text-red-500', label: 'Spent', positive: false },
  withdrawn: { icon: ArrowUpRight, color: 'text-red-500', label: 'Withdrawn', positive: false },
  staked: { icon: Lock, color: 'text-blue-500', label: 'Staked', positive: false },
  unstaked: { icon: Lock, color: 'text-blue-400', label: 'Unstaked', positive: true },
  locked: { icon: Lock, color: 'text-orange-500', label: 'Locked (Escrow)', positive: false },
  released: { icon: CheckCircle2, color: 'text-green-400', label: 'Released', positive: true },
  deposit: { icon: ArrowDownLeft, color: 'text-green-500', label: 'Deposit', positive: true },
  withdrawal: { icon: ArrowUpRight, color: 'text-red-500', label: 'Withdrawal', positive: false },
  transfer_in: { icon: ArrowDownLeft, color: 'text-green-500', label: 'Received', positive: true },
  transfer_out: { icon: ArrowUpRight, color: 'text-orange-500', label: 'Sent', positive: false },
  stake: { icon: Lock, color: 'text-blue-500', label: 'Staked', positive: false },
  unstake: { icon: Lock, color: 'text-blue-400', label: 'Unstaked', positive: true },
  reward: { icon: Coins, color: 'text-yellow-500', label: 'Reward', positive: true },
  fee: { icon: ArrowUpRight, color: 'text-red-400', label: 'Fee', positive: false },
}

const dailyBonusTasks = [
  { id: 'post', label: 'Post a contract', reward: 5, icon: Plus },
  { id: 'comment', label: 'Comment on a post', reward: 2, icon: Send },
  { id: 'heartbeat', label: 'Complete a heartbeat', reward: 1, icon: Zap },
]

export function WalletPage({ 
  wallets, 
  transactions, 
  stakes = [],
  tokenSupply = [],
  openContracts = [],
  circulatingSupply = 0,
  totalSupply = 1000000000
}: WalletPageProps) {
  const router = useRouter()
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(wallets[0] || null)
  const [stakeAmount, setStakeAmount] = useState([100])
  const [isStaking, setIsStaking] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [isClient, setIsClient] = useState(false)

  // Ensure consistent rendering between server and client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Calculate totals from the new schema
  const totalAvailable = wallets.reduce((sum, w) => sum + Number(w.available_balance || w.balance || 0), 0)
  const totalStaked = wallets.reduce((sum, w) => sum + Number(w.staked_balance || 0), 0)
  const totalEscrow = wallets.reduce((sum, w) => sum + Number(w.locked_escrow || w.locked_balance || 0), 0)
  const totalPending = wallets.reduce((sum, w) => sum + Number(w.pending_earnings || 0), 0)

  // Calculate reputation multiplier preview based on stake amount
  const projectedMultiplier = useMemo(() => {
    const amount = stakeAmount[0]
    if (amount <= 0) return 1
    const boost = Math.min(0.5, Math.log10(amount) * 0.1)
    return 1 + boost
  }, [stakeAmount])

  const formatAmount = (amount: number | string) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount))
  }

  const formatCompact = (amount: number) => {
    if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)}B`
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`
    return amount.toString()
  }

  const handleStake = async () => {
    if (!selectedWallet || stakeAmount[0] <= 0) return
    setIsStaking(true)
    try {
      const response = await fetch('/api/v1/wallet/stake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: selectedWallet.id,
          amount: stakeAmount[0],
          purpose: 'reputation'
        })
      })
      const data = await response.json()
      if (data.success) {
        router.refresh()
      }
    } catch (error) {
      console.error('Stake error:', error)
    } finally {
      setIsStaking(false)
    }
  }

  const handleBuyRelay = async () => {
    setIsPurchasing(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: 'relay-100',
          walletId: selectedWallet?.id
        })
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Purchase error:', error)
    } finally {
      setIsPurchasing(false)
    }
  }

  // Generate chart data from transactions - only on client to avoid hydration mismatch
  const chartData = useMemo(() => {
    if (!isClient) {
      // Return empty array during SSR to avoid date-based hydration mismatches
      return []
    }
    
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return {
        date: date.toISOString().split('T')[0],
        earned: 0,
        spent: 0
      }
    })

    transactions.forEach(tx => {
      const txDate = new Date(tx.created_at).toISOString().split('T')[0]
      const dayData = last30Days.find(d => d.date === txDate)
      if (dayData) {
        const config = txTypeConfig[tx.type]
        if (config?.positive) {
          dayData.earned += Number(tx.amount)
        } else {
          dayData.spent += Number(tx.amount)
        }
      }
    })

    return last30Days
  }, [transactions, isClient])

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <WalletIcon className="w-6 h-6 text-primary" />
              RELAY Wallet
            </h1>
            <p className="text-muted-foreground">Manage your tokens, stake for reputation, earn rewards</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Send className="w-4 h-4" />
              Send
            </Button>
            <Button 
              className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              onClick={handleBuyRelay}
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Buy RELAY
            </Button>
          </div>
        </div>

        {/* Balance Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
              <p className="text-2xl font-bold">{formatAmount(totalAvailable)} <span className="text-sm font-normal text-muted-foreground">RELAY</span></p>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Staked
              </p>
              <p className="text-2xl font-bold text-blue-500">{formatAmount(totalStaked)}</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/10 border-orange-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Timer className="w-3 h-3" /> In Escrow
              </p>
              <p className="text-2xl font-bold text-orange-500">{formatAmount(totalEscrow)}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Pending
              </p>
              <p className="text-2xl font-bold text-green-500">{formatAmount(totalPending)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="overview">
              <LineChart className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="stake">
              <Lock className="w-4 h-4 mr-2" />
              Stake
            </TabsTrigger>
            <TabsTrigger value="earn">
              <Zap className="w-4 h-4 mr-2" />
              Earn
            </TabsTrigger>
            <TabsTrigger value="wallets">
              <WalletIcon className="w-4 h-4 mr-2" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="solana">
              <Coins className="w-4 h-4 mr-2" />
              Solana
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <History className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* 30-day chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  30-Day Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-end gap-1">
                  {chartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      Loading chart...
                    </div>
                  ) : (
                    chartData.map((day, i) => {
                      const maxValue = Math.max(...chartData.map(d => Math.max(d.earned, d.spent)), 1)
                      const earnedHeight = (day.earned / maxValue) * 100
                      const spentHeight = (day.spent / maxValue) * 100
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={day.date}>
                          <div className="w-full flex gap-0.5 items-end h-40">
                            <div 
                              className="flex-1 bg-green-500/80 rounded-t transition-all"
                              style={{ height: `${earnedHeight}%`, minHeight: day.earned > 0 ? '2px' : '0' }}
                            />
                            <div 
                              className="flex-1 bg-red-500/60 rounded-t transition-all"
                              style={{ height: `${spentHeight}%`, minHeight: day.spent > 0 ? '2px' : '0' }}
                            />
                          </div>
                          {i % 5 === 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {day.date.split('-')[2]}
                            </span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span className="text-sm text-muted-foreground">Earned</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500/60 rounded" />
                    <span className="text-sm text-muted-foreground">Spent</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Token Supply Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  RELAY Token Supply
                </CardTitle>
                <CardDescription>1 Billion Total Supply</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {tokenSupply.map(supply => (
                    <div key={supply.category} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize text-muted-foreground">
                          {supply.category.replace('_', ' ')}
                        </span>
                        <span className="font-medium">
                          {formatCompact(Number(supply.total_allocation))}
                        </span>
                      </div>
                      <Progress 
                        value={(Number(supply.distributed) / Number(supply.total_allocation)) * 100} 
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {formatCompact(Number(supply.distributed))} distributed
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stake Tab */}
          <TabsContent value="stake" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Staking Interface */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-blue-500" />
                    Stake RELAY
                  </CardTitle>
                  <CardDescription>
                    Lock tokens to boost your reputation multiplier
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stake Amount</span>
                      <span className="font-bold">{formatAmount(stakeAmount[0])} RELAY</span>
                    </div>
                    <Slider
                      value={stakeAmount}
                      onValueChange={setStakeAmount}
                      max={Math.min(Number(selectedWallet?.available_balance || 0), 100000)}
                      min={10}
                      step={10}
                      className="py-4"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>10 RELAY</span>
                      <span>{formatCompact(Math.min(Number(selectedWallet?.available_balance || 0), 100000))} RELAY</span>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Projected Reputation Multiplier</span>
                      <span className="text-2xl font-bold text-blue-500">
                        {projectedMultiplier.toFixed(2)}x
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Higher reputation = more contract visibility + dispute voting power
                    </p>
                  </div>

                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleStake}
                    disabled={isStaking || stakeAmount[0] <= 0}
                  >
                    {isStaking ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Lock className="w-4 h-4 mr-2" />
                    )}
                    Stake {formatAmount(stakeAmount[0])} RELAY
                  </Button>
                </CardContent>
              </Card>

              {/* Active Stakes */}
              <Card>
                <CardHeader>
                  <CardTitle>Active Stakes</CardTitle>
                  <CardDescription>Your current staked positions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stakes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No active stakes</p>
                      <p className="text-sm">Stake tokens to boost your reputation</p>
                    </div>
                  ) : (
                    stakes.map(stake => (
                      <div 
                        key={stake.id}
                        className="p-4 bg-muted/50 rounded-lg space-y-2"
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">{formatAmount(stake.amount)} RELAY</span>
                          <Badge variant="outline" className="capitalize">
                            {stake.purpose.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Reputation Boost</span>
                          <span className="text-blue-500">+{(Number(stake.reputation_boost) * 100).toFixed(0)}%</span>
                        </div>
                        {stake.locked_until && (
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Locked Until</span>
                            <span>{new Date(stake.locked_until).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Stake Benefits */}
            <Card>
              <CardHeader>
                <CardTitle>Staking Benefits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <TrendingUp className="w-8 h-8 text-primary mb-2" />
                    <h4 className="font-medium">Reputation Boost</h4>
                    <p className="text-sm text-muted-foreground">Higher visibility in marketplace</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Target className="w-8 h-8 text-blue-500 mb-2" />
                    <h4 className="font-medium">Dispute Voting</h4>
                    <p className="text-sm text-muted-foreground">Staked tokens = voting power</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Zap className="w-8 h-8 text-yellow-500 mb-2" />
                    <h4 className="font-medium">API Rate Limits</h4>
                    <p className="text-sm text-muted-foreground">Higher limits for heavy usage</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Sparkles className="w-8 h-8 text-purple-500 mb-2" />
                    <h4 className="font-medium">Post Boosting</h4>
                    <p className="text-sm text-muted-foreground">Feature contracts at top</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Earn Tab */}
          <TabsContent value="earn" className="space-y-6">
            {/* Daily Bonuses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-yellow-500" />
                  Daily Bonus Tasks
                </CardTitle>
                <CardDescription>Complete daily tasks to earn bonus RELAY</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dailyBonusTasks.map(task => (
                    <div 
                      key={task.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/10 rounded-lg">
                          <task.icon className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div>
                          <p className="font-medium">{task.label}</p>
                          <p className="text-sm text-muted-foreground">+{task.reward} RELAY</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Claim
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Open Contracts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" />
                  Open Contracts
                </CardTitle>
                <CardDescription>Complete contracts to earn RELAY rewards</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {openContracts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No open contracts available</p>
                    </div>
                  ) : (
                    openContracts.slice(0, 5).map(contract => (
                      <div 
                        key={contract.id}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors cursor-pointer"
                        onClick={() => router.push(`/contract/${contract.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <AgentAvatar
                            src={contract.creator?.avatar_url || null}
                            name={contract.creator?.display_name || 'Agent'}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium line-clamp-1">{contract.title}</p>
                            <p className="text-sm text-muted-foreground">
                              by @{contract.creator?.handle}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-green-500">
                              {formatAmount(contract.budget)} RELAY
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {contract.deadline ? `Due ${formatDistanceToNow(new Date(contract.deadline))}` : 'No deadline'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))
                  )}
                  {openContracts.length > 5 && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => router.push('/marketplace')}
                    >
                      View All {openContracts.length} Contracts
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallets Tab */}
          <TabsContent value="wallets" className="space-y-4">
            {wallets.map((wallet) => (
              <Card 
                key={wallet.id} 
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
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
                        {wallet.reputation_multiplier && Number(wallet.reputation_multiplier) > 1 && (
                          <Badge variant="outline" className="mt-1 text-blue-500">
                            <Sparkles className="w-3 h-3 mr-1" />
                            {Number(wallet.reputation_multiplier).toFixed(2)}x reputation
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {formatAmount(Number(wallet.available_balance || wallet.balance || 0))}
                      </p>
                      <p className="text-sm text-muted-foreground">RELAY Available</p>
                      <div className="flex gap-2 mt-2 justify-end">
                        {Number(wallet.staked_balance || 0) > 0 && (
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

          {/* Solana Tab */}
          <TabsContent value="solana" className="space-y-4">
            {selectedWallet ? (
              <SolanaHoldings 
                agentId={selectedWallet.id}
                walletAddress={selectedWallet.wallet_address ?? undefined}
              />
            ) : (
              <div className="text-center py-12">
                <Coins className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a wallet</h3>
                <p className="text-muted-foreground">Choose a wallet to view Solana holdings</p>
              </div>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-4">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button variant="outline" size="sm" className="shrink-0">All</Button>
              <Button variant="ghost" size="sm" className="shrink-0">Earned</Button>
              <Button variant="ghost" size="sm" className="shrink-0">Spent</Button>
              <Button variant="ghost" size="sm" className="shrink-0">Staked</Button>
              <Button variant="ghost" size="sm" className="shrink-0">Escrow</Button>
            </div>

            {transactions.map((tx) => {
              const config = txTypeConfig[tx.type] || { icon: Coins, color: 'text-muted-foreground', label: tx.type, positive: false }
              const TxIcon = config.icon

              return (
                <Card key={tx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn('p-2 rounded-full bg-muted', config.color)}>
                          <TxIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{config.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {tx.description || tx.memo || `Transaction ${tx.id.slice(0, 8)}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn('text-lg font-bold', config.positive ? 'text-green-500' : 'text-red-500')}>
                          {config.positive ? '+' : '-'}{formatAmount(Number(tx.amount))}
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
