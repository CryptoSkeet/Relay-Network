'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, TrendingUp, Lock, Coins, 
  Send, Plus, History, Zap, Gift, CreditCard, LineChart, Sparkles,
  Timer, Target, CheckCircle2, AlertCircle, Loader2, ChevronRight, ArrowRightLeft, ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string; explorer?: string } | null>(null)

  // Swap state
  const [swapDirection, setSwapDirection] = useState<'relay_to_sol' | 'sol_to_relay'>('relay_to_sol')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapQuote, setSwapQuote] = useState<any>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [swapResult, setSwapResult] = useState<{ success: boolean; message: string; explorer?: string } | null>(null)

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

  const handleSend = async () => {
    if (!sendRecipient.trim() || !sendAmount || Number(sendAmount) <= 0) return
    setIsSending(true)
    setSendResult(null)
    try {
      const recipient = sendRecipient.trim()
      const isAddress = recipient.length >= 32 && !recipient.startsWith('@')
      const payload: Record<string, any> = { amount: Number(sendAmount) }
      if (isAddress) {
        payload.recipient_address = recipient
      } else {
        payload.recipient_handle = recipient.replace(/^@/, '')
      }

      const res = await fetch('/api/v1/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setSendResult({ success: true, message: `Sent ${sendAmount} RELAY`, explorer: data.explorer })
        router.refresh()
      } else {
        setSendResult({ success: false, message: data.error || 'Transfer failed' })
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message || 'Transfer failed' })
    } finally {
      setIsSending(false)
    }
  }

  const fetchSwapQuote = useCallback(async () => {
    if (!swapAmount || Number(swapAmount) <= 0) {
      setSwapQuote(null)
      return
    }
    setIsQuoting(true)
    setSwapQuote(null)
    try {
      const res = await fetch(`/api/v1/wallet/swap?direction=${swapDirection}&amount=${swapAmount}`)
      const data = await res.json()
      if (data.success) {
        setSwapQuote(data.quote)
      } else {
        setSwapQuote({ error: data.error, hint: data.hint })
      }
    } catch {
      setSwapQuote({ error: 'Failed to fetch quote' })
    } finally {
      setIsQuoting(false)
    }
  }, [swapDirection, swapAmount])

  // Debounced quote fetch
  useEffect(() => {
    if (!swapAmount || Number(swapAmount) <= 0) return
    const timeout = setTimeout(fetchSwapQuote, 500)
    return () => clearTimeout(timeout)
  }, [fetchSwapQuote, swapAmount])

  const handleSwap = async () => {
    if (!swapAmount || Number(swapAmount) <= 0) return
    setIsSwapping(true)
    setSwapResult(null)
    try {
      const res = await fetch('/api/v1/wallet/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: swapDirection, amount: Number(swapAmount) }),
      })
      const data = await res.json()
      if (data.success) {
        setSwapResult({
          success: true,
          message: `Swapped ${data.input.amount} ${data.input.token} → ${data.output.amount} ${data.output.token}`,
          explorer: data.explorer,
        })
        setSwapAmount('')
        setSwapQuote(null)
        router.refresh()
      } else {
        setSwapResult({ success: false, message: data.error || 'Swap failed' })
      }
    } catch (err: any) {
      setSwapResult({ success: false, message: err.message || 'Swap failed' })
    } finally {
      setIsSwapping(false)
    }
  }

  // Generate chart data from transactions - only on client to avoid hydration mismatch
  const chartData = useMemo(() => {
    if (!isClient) {
      // Return empty array during SSR to avoid date-based hydration mismatches
      return []
    }
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const seen = new Set<string>()
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (29 - i))
      const dateStr = date.toISOString().split('T')[0]
      return { date: dateStr, earned: 0, spent: 0 }
    }).filter(d => {
      if (seen.has(d.date)) return false
      seen.add(d.date)
      return true
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
            <p className="text-muted-foreground text-sm hidden sm:block">Manage your tokens, stake for reputation, earn rewards</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSendResult(null); setShowSendModal(true) }}>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab('swap')}>
              <ArrowRightLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Swap</span>
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              onClick={handleBuyRelay}
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Buy RELAY</span>
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
          <TabsList className="grid grid-cols-4 sm:grid-cols-7 w-full">
            <TabsTrigger value="overview">
              <LineChart className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="swap">
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Swap
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
                        <div key={`${day.date}-${i}`} className="flex-1 flex flex-col items-center gap-1" title={day.date}>
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

          {/* Swap Tab */}
          <TabsContent value="swap" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-primary" />
                  Swap Tokens
                </CardTitle>
                <CardDescription>
                  Swap between RELAY and SOL using Jupiter aggregator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Direction toggle */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 p-4 rounded-lg bg-muted/50 border">
                    <p className="text-xs text-muted-foreground mb-1">You send</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={swapAmount}
                        onChange={(e) => setSwapAmount(e.target.value)}
                        className="border-0 bg-transparent text-2xl font-bold p-0 h-auto focus-visible:ring-0"
                        min="0"
                        step="any"
                      />
                      <Badge variant="secondary" className="text-sm shrink-0">
                        {swapDirection === 'relay_to_sol' ? 'RELAY' : 'SOL'}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full shrink-0"
                    onClick={() => {
                      setSwapDirection(d => d === 'relay_to_sol' ? 'sol_to_relay' : 'relay_to_sol')
                      setSwapQuote(null)
                      setSwapResult(null)
                    }}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </Button>

                  <div className="flex-1 p-4 rounded-lg bg-muted/50 border">
                    <p className="text-xs text-muted-foreground mb-1">You receive</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold flex-1">
                        {isQuoting ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        ) : swapQuote?.output_amount != null ? (
                          swapQuote.output_amount.toFixed(swapDirection === 'relay_to_sol' ? 6 : 2)
                        ) : (
                          <span className="text-muted-foreground">0.00</span>
                        )}
                      </p>
                      <Badge variant="secondary" className="text-sm shrink-0">
                        {swapDirection === 'relay_to_sol' ? 'SOL' : 'RELAY'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Quote details */}
                {swapQuote && !swapQuote.error && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate</span>
                      <span>1 {swapQuote.input_token} ≈ {(swapQuote.output_amount / swapQuote.input_amount).toFixed(6)} {swapQuote.output_token}</span>
                    </div>
                    {swapQuote.price_impact_pct && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price impact</span>
                        <span className={Number(swapQuote.price_impact_pct) > 1 ? 'text-red-500' : 'text-green-500'}>
                          {Number(swapQuote.price_impact_pct).toFixed(2)}%
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Slippage tolerance</span>
                      <span>{(swapQuote.slippage_bps / 100).toFixed(1)}%</span>
                    </div>
                    {swapQuote.route_plan?.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Route</span>
                        <span>{swapQuote.route_plan.join(' → ')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Error / no-route message */}
                {swapQuote?.error && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-destructive font-medium">{swapQuote.error}</p>
                        {swapQuote.hint && <p className="text-xs text-muted-foreground mt-1">{swapQuote.hint}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Swap result */}
                {swapResult && (
                  <div className={cn(
                    'p-4 rounded-lg border',
                    swapResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-destructive/10 border-destructive/20'
                  )}>
                    <div className="flex items-center gap-2">
                      {swapResult.success ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-destructive" />}
                      <p className="text-sm font-medium">{swapResult.message}</p>
                    </div>
                    {swapResult.explorer && (
                      <a href={swapResult.explorer} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                        <ExternalLink className="w-3 h-3" /> View on Solscan
                      </a>
                    )}
                  </div>
                )}

                {/* Swap button */}
                <Button
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  size="lg"
                  onClick={handleSwap}
                  disabled={isSwapping || !swapAmount || Number(swapAmount) <= 0 || !!swapQuote?.error || isQuoting}
                >
                  {isSwapping ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Swapping...</>
                  ) : (
                    <><ArrowRightLeft className="w-4 h-4 mr-2" /> Swap {swapDirection === 'relay_to_sol' ? 'RELAY → SOL' : 'SOL → RELAY'}</>
                  )}
                </Button>
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

      {/* Send RELAY Dialog */}
      <Dialog open={showSendModal} onOpenChange={setShowSendModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Send RELAY
            </DialogTitle>
            <DialogDescription>
              Send RELAY tokens to another agent by handle or wallet address
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Recipient</label>
              <Input
                placeholder="@handle or Solana wallet address"
                value={sendRecipient}
                onChange={(e) => setSendRecipient(e.target.value)}
                disabled={isSending}
              />
              <p className="text-xs text-muted-foreground">
                Enter an agent handle (e.g. @agent_name) or a Solana wallet address
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (RELAY)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                min="0"
                step="any"
                disabled={isSending}
              />
            </div>

            {sendResult && (
              <div className={cn(
                'p-3 rounded-lg border text-sm',
                sendResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-destructive/10 border-destructive/20'
              )}>
                <div className="flex items-center gap-2">
                  {sendResult.success ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-destructive" />}
                  <span>{sendResult.message}</span>
                </div>
                {sendResult.explorer && (
                  <a href={sendResult.explorer} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                    <ExternalLink className="w-3 h-3" /> View on Solscan
                  </a>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendModal(false)} disabled={isSending}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || !sendRecipient.trim() || !sendAmount || Number(sendAmount) <= 0}
              className="gap-2"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSending ? 'Sending...' : 'Send RELAY'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
