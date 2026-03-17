'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertCircle, Coins, ArrowRight, Filter, CheckCheck, Zap, RefreshCw, PlusCircle, Loader2, Wallet, Lock, Unlock, Scale, Send, Eye, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { NewContractDialog } from '@/components/relay/new-contract-dialog'
import type { Agent, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'

interface Milestone {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  progress_percent: number
  due_date?: string
  order_index: number
}

interface Deliverable {
  id: string
  contract_id: string
  title: string
  description?: string
  acceptance_criteria?: string[]
  proof_links?: string[]
  proof_hashes?: string[]
  status: 'pending' | 'submitted' | 'accepted' | 'rejected'
  submitted_at?: string
  verified_at?: string
}

interface Escrow {
  id: string
  contract_id: string
  payer_id: string
  payee_id?: string
  amount: number
  currency: string
  status: 'locked' | 'pending_release' | 'released' | 'refunded' | 'disputed'
  locked_at: string
  released_at?: string
  release_tx_hash?: string
}

interface Dispute {
  id: string
  contract_id: string
  initiated_by: string
  reason: string
  evidence_links?: string[]
  status: string
  dispute_window_ends?: string
  created_at: string
}

interface CapabilityTag {
  id: string
  name: string
  category: string
  description: string
  icon: string
  usage_count: number
}

interface ContractWithAgents extends Omit<Contract, 'deliverables'> {
  client?: Agent
  provider?: Agent
  deliverables?: Deliverable[] | string[]
  escrow?: Escrow[]
  dispute?: Dispute | null
  capabilities?: Array<{
    capability: CapabilityTag | null
  }>
  accepted_at?: string | null
  delivered_at?: string | null
  verified_at?: string | null
  cancelled_at?: string | null
}

interface ContractsPageProps {
  contracts: ContractWithAgents[]
  agents: Agent[]
  userAgentId: string | null
  capabilityTags: CapabilityTag[]
}

const statusConfig: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  draft: { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted' },
  open: { icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  in_progress: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  disputed: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
}

export function ContractsPage({ contracts: initialContracts, agents, userAgentId, capabilityTags }: ContractsPageProps) {
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'all' | 'my-created' | 'my-accepted'>('all')
  const [contracts, setContracts] = useState<ContractWithAgents[]>(initialContracts)
  const [contractMilestones, setContractMilestones] = useState<Record<string, Milestone[]>>({})
  const [isNewContractOpen, setIsNewContractOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [addMilestoneContractId, setAddMilestoneContractId] = useState<string | null>(null)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [isAddingMilestone, setIsAddingMilestone] = useState(false)
  const [updatingMilestoneId, setUpdatingMilestoneId] = useState<string | null>(null)
  const [selectedContract, setSelectedContract] = useState<ContractWithAgents | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Update milestone progress
  const updateMilestoneProgress = async (milestoneId: string, contractId: string, progress: number) => {
    setUpdatingMilestoneId(milestoneId)
    try {
      const response = await fetch('/api/milestones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone_id: milestoneId, progress_percent: progress }),
      })

      if (response.ok) {
        // Update local state
        setContractMilestones(prev => ({
          ...prev,
          [contractId]: prev[contractId]?.map(m =>
            m.id === milestoneId
              ? { ...m, progress_percent: progress, status: progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending' }
              : m
          ) || []
        }))
      }
    } catch (err) {
      console.error('Failed to update milestone:', err)
    } finally {
      setUpdatingMilestoneId(null)
    }
  }

  // Add new milestone
  const addMilestone = async (contractId: string) => {
    if (!newMilestoneTitle.trim()) return
    setIsAddingMilestone(true)
    try {
      const response = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, title: newMilestoneTitle.trim() }),
      })

      const data = await response.json()
      if (response.ok && data.milestone) {
        setContractMilestones(prev => ({
          ...prev,
          [contractId]: [...(prev[contractId] || []), data.milestone]
        }))
        setNewMilestoneTitle('')
        setAddMilestoneContractId(null)
      }
    } catch (err) {
      console.error('Failed to add milestone:', err)
    } finally {
      setIsAddingMilestone(false)
    }
  }

  useEffect(() => {
    const fetchMilestones = async () => {
      const contractIds = contracts.map(c => c.id)
      if (contractIds.length === 0) return

      const supabase = createClient()
      const { data: milestones } = await supabase
        .from('contract_milestones')
        .select('*')
        .in('contract_id', contractIds)
        .order('order_index')

      if (milestones) {
        const grouped = milestones.reduce((acc, m) => {
          if (!acc[m.contract_id]) acc[m.contract_id] = []
          acc[m.contract_id].push(m)
          return acc
        }, {} as Record<string, Milestone[]>)
        setContractMilestones(grouped)
      }
    }

    fetchMilestones()
  }, [contracts])

  const handleContractCreated = async () => {
    setIsRefreshing(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('contracts')
        .select('*, client:client_id(*), provider:provider_id(*)')
        .order('created_at', { ascending: false })

      if (data) {
        setContracts(data as ContractWithAgents[])
      }
    } catch (err) {
      console.error('Failed to refresh contracts:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filter by view mode
  const viewFilteredContracts = useMemo(() => {
    switch (viewMode) {
      case 'my-created':
        return contracts.filter(c => c.client_id === userAgentId)
      case 'my-accepted':
        return contracts.filter(c => c.provider_id === userAgentId)
      default:
        return contracts // 'all' shows every contract on the network
    }
  }, [contracts, userAgentId, viewMode])

  const filteredContracts = viewFilteredContracts.filter(contract => {
    if (filter === 'all') return true
    if (filter === 'active') return ['in_progress', 'delivered'].includes(contract.status)
    if (filter === 'disputed') return contract.status === 'disputed'
    return contract.status === filter
  })

  // Contract actions
  const handleDeliverContract = async (contractId: string) => {
    setIsActionLoading(true)
    try {
      const response = await fetch(`/api/v1/contracts/${contractId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      // Update local state
      setContracts(prev => prev.map(c =>
        c.id === contractId ? { ...c, status: 'delivered' as const } : c
      ))
      setSelectedContract(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to deliver contract')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleVerifyContract = async (contractId: string) => {
    setIsActionLoading(true)
    try {
      const response = await fetch(`/api/v1/contracts/${contractId}/verify`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      // Update local state
      setContracts(prev => prev.map(c => 
        c.id === contractId ? { ...c, status: 'completed' } : c
      ))
      setSelectedContract(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to verify contract')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDisputeContract = async (contractId: string, reason: string) => {
    setIsActionLoading(true)
    try {
      const response = await fetch(`/api/v1/contracts/${contractId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      // Update local state
      setContracts(prev => prev.map(c => 
        c.id === contractId ? { ...c, status: 'disputed' } : c
      ))
      setSelectedContract(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to open dispute')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Calculate escrow totals
  const escrowStats = useMemo(() => {
    const myContracts = userAgentId 
      ? contracts.filter(c => c.client_id === userAgentId || c.provider_id === userAgentId)
      : []
    
    let locked = 0
    let pending = 0
    let released = 0

    myContracts.forEach(c => {
      const escrow = c.escrow?.[0]
      if (!escrow) return
      
      if (escrow.status === 'locked' || escrow.status === 'disputed') {
        locked += escrow.amount
      } else if (escrow.status === 'pending_release') {
        pending += escrow.amount
      } else if (escrow.status === 'released') {
        released += escrow.amount
      }
    })

    return { locked, pending, released }
  }, [contracts, userAgentId])

  const getOverallProgress = (contractId: string, contractStatus: string) => {
    // Completed contracts always show 100%
    if (contractStatus === 'completed') return 100
    
    const milestones = contractMilestones[contractId] || []
    if (milestones.length === 0) return 0
    const total = milestones.reduce((sum, m) => sum + (m.progress_percent || 0), 0)
    return Math.round(total / milestones.length)
  }

  const getMilestoneIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCheck className="w-3 h-3 text-green-500" />
      case 'in_progress':
        return <Zap className="w-3 h-3 text-blue-500" />
      case 'blocked':
        return <AlertCircle className="w-3 h-3 text-red-500" />
      default:
        return <Clock className="w-3 h-3 text-gray-400" />
    }
  }

  const markContractComplete = async (contractId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('contracts')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', contractId)

    if (!error) {
      setContracts(prev => prev.map(c => 
        c.id === contractId 
          ? { ...c, status: 'completed', completed_at: new Date().toISOString() }
          : c
      ))
    }
  }

  // Auto-check and complete contracts when all milestones reach 100%
  useEffect(() => {
    const checkAndAutoComplete = async () => {
      const supabase = createClient()
      for (const contract of contracts) {
        // Skip already completed, cancelled, or disputed contracts
        if (['completed', 'cancelled', 'disputed'].includes(contract.status)) continue
        
        const milestones = contractMilestones[contract.id] || []
        if (milestones.length === 0) continue
        
        // Check if all milestones are at 100%
        const allComplete = milestones.every(m => m.progress_percent === 100)
        
        if (allComplete) {
          // Auto-complete the contract directly
          const { error } = await supabase
            .from('contracts')
            .update({ 
              status: 'completed', 
              completed_at: new Date().toISOString() 
            })
            .eq('id', contract.id)

          if (!error) {
            setContracts(prev => prev.map(c => 
              c.id === contract.id 
                ? { ...c, status: 'completed', completed_at: new Date().toISOString() }
                : c
            ))
          }
        }
      }
    }

    // Only run when we have milestone data
    if (Object.keys(contractMilestones).length > 0) {
      checkAndAutoComplete()
    }
  }, [contractMilestones, contracts])

  const stats = useMemo(() => {
    const baseContracts = viewFilteredContracts
    return {
      total: baseContracts.length,
      active: baseContracts.filter(c => ['in_progress', 'delivered'].includes(c.status)).length,
      completed: baseContracts.filter(c => c.status === 'completed').length,
      open: baseContracts.filter(c => c.status === 'open').length,
      disputed: baseContracts.filter(c => c.status === 'disputed').length,
    }
  }, [viewFilteredContracts])

  // Get timeline events for a contract
  const getContractTimeline = (contract: ContractWithAgents) => {
    const events: Array<{ date: string; event: string; type: 'info' | 'success' | 'warning' | 'error' }> = []
    
    events.push({ date: contract.created_at, event: 'Contract created', type: 'info' })
    
    if (contract.accepted_at) {
      events.push({ date: contract.accepted_at, event: 'Contract accepted', type: 'success' })
    }
    
    if (contract.delivered_at) {
      events.push({ date: contract.delivered_at, event: 'Deliverables submitted', type: 'info' })
    }
    
    if (contract.verified_at) {
      events.push({ date: contract.verified_at, event: 'Delivery verified', type: 'success' })
    }
    
    if (contract.completed_at) {
      events.push({ date: contract.completed_at, event: 'Contract completed', type: 'success' })
    }
    
    if (contract.dispute) {
      events.push({ date: contract.dispute.created_at, event: 'Dispute opened', type: 'error' })
    }
    
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border px-3 sm:px-4 py-3 sm:py-4 safe-area-top">
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              <span className="truncate">My Contracts</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Manage your contracts, deliverables, and escrow</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleContractCreated}
              disabled={isRefreshing}
              className="touch-manipulation h-9 w-9 sm:h-10 sm:w-10"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button
              onClick={() => setIsNewContractOpen(true)}
              className="gap-1.5 sm:gap-2 touch-manipulation h-9 sm:h-10 px-3 sm:px-4 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Contract</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* View Mode Selector */}
        {userAgentId && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <Button
              variant={viewMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('all')}
              className="shrink-0"
            >
              All My Contracts
            </Button>
            <Button
              variant={viewMode === 'my-created' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('my-created')}
              className="shrink-0"
            >
              <Send className="w-3 h-3 mr-1.5" />
              Created by Me
            </Button>
            <Button
              variant={viewMode === 'my-accepted' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('my-accepted')}
              className="shrink-0"
            >
              <CheckCircle className="w-3 h-3 mr-1.5" />
              Accepted by Me
            </Button>
          </div>
        )}

        {/* Stats and Escrow Widget */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          <Card className="bg-muted/50">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-bold text-blue-500">{stats.open}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-bold text-yellow-500">{stats.active}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Done</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/10 border-orange-500/20">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-bold text-orange-500">{stats.disputed}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Disputed</p>
            </CardContent>
          </Card>
        </div>

        {/* Escrow Widget */}
        {userAgentId && (escrowStats.locked > 0 || escrowStats.pending > 0 || escrowStats.released > 0) && (
          <Card className="mt-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Escrow Wallet</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-yellow-500" />
                  <div>
                    <p className="text-lg font-bold">{escrowStats.locked.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Locked</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-lg font-bold">{escrowStats.pending.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="text-lg font-bold">{escrowStats.released.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Released</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4" suppressHydrationWarning>
        {mounted ? (
          <Tabs value={filter} onValueChange={setFilter} className="space-y-3 sm:space-y-4" suppressHydrationWarning>
            <TabsList className="w-full overflow-x-auto scrollbar-hide gap-1" suppressHydrationWarning>
              <TabsTrigger value="all" className="touch-manipulation text-xs sm:text-sm">All</TabsTrigger>
              <TabsTrigger value="open" className="touch-manipulation text-xs sm:text-sm">Open</TabsTrigger>
              <TabsTrigger value="active" className="touch-manipulation text-xs sm:text-sm">Active</TabsTrigger>
              <TabsTrigger value="delivered" className="touch-manipulation text-xs sm:text-sm">Delivered</TabsTrigger>
              <TabsTrigger value="completed" className="touch-manipulation text-xs sm:text-sm">Completed</TabsTrigger>
              <TabsTrigger value="disputed" className="touch-manipulation text-xs sm:text-sm text-orange-500">Disputed</TabsTrigger>
            </TabsList>

          <div className="space-y-3 sm:space-y-4">
            {filteredContracts.map((contract) => {
              const StatusIcon = statusConfig[contract.status as keyof typeof statusConfig]?.icon || FileText
              const statusColor = statusConfig[contract.status as keyof typeof statusConfig]?.color || 'text-muted-foreground'
              const statusBg = statusConfig[contract.status as keyof typeof statusConfig]?.bg || 'bg-muted'
              const overallProgress = getOverallProgress(contract.id, contract.status)
              const milestones = contractMilestones[contract.id] || []
              const completedMilestones = milestones.filter(m => m.status === 'completed').length

              return (
                <Card key={contract.id} className="glass-card hover:border-primary/50 transition-all">
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge className={cn(statusBg, statusColor, 'capitalize text-xs')}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {contract.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-semibold mb-1 line-clamp-2">{contract.title}</h3>
                        <p className="text-muted-foreground text-xs sm:text-sm mb-3 line-clamp-2">
                          {contract.description}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "text-xl sm:text-2xl font-bold",
                          overallProgress === 100 ? "text-green-500" : "text-primary"
                        )}>{overallProgress}%</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {contract.status === 'completed' ? 'Completed' : 'Progress'}
                        </p>
                        {contract.completed_at && (
                          <p className="text-[10px] text-green-500 mt-1">
                            {formatDistanceToNow(new Date(contract.completed_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <Progress 
                        value={overallProgress} 
                        className={cn("h-2", overallProgress === 100 && "bg-green-500/20")} 
                      />
                      <div className="flex items-center justify-between">
                        {milestones.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {completedMilestones} of {milestones.length} milestones completed
                          </p>
                        )}
                        {overallProgress === 100 && contract.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="h-6 text-xs text-green-500 border-green-500/50 hover:bg-green-500/10"
                            onClick={() => markContractComplete(contract.id)}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Mark Complete
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Parties */}
                    <div className="grid grid-cols-2 gap-4">
                      {contract.client && (
                        <Link href={`/agent/${contract.client.handle}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                          <AgentAvatar src={contract.client.avatar_url || null} name={contract.client.display_name} size="sm" />
                          <div>
                            <p className="text-sm font-medium">Client</p>
                            <p className="text-xs text-muted-foreground">@{contract.client.handle}</p>
                          </div>
                        </Link>
                      )}
                      {contract.provider && (
                        <Link href={`/agent/${contract.provider.handle}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                          <AgentAvatar src={contract.provider.avatar_url || null} name={contract.provider.display_name} size="sm" />
                          <div>
                            <p className="text-sm font-medium">Provider</p>
                            <p className="text-xs text-muted-foreground">@{contract.provider.handle}</p>
                          </div>
                        </Link>
                      )}
                    </div>

                    {/* Milestones */}
                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Milestones</p>
                        {contract.status !== 'completed' && contract.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => setAddMilestoneContractId(contract.id)}
                          >
                            <PlusCircle className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                      {milestones.length > 0 ? (
                        <div className="space-y-3">
                          {milestones.map(milestone => (
                            <div key={milestone.id} className="space-y-2 p-2 rounded-lg bg-muted/30">
                              <div className="flex items-center gap-2 text-xs">
                                {getMilestoneIcon(milestone.status)}
                                <span className="flex-1 font-medium">{milestone.title}</span>
                                <span className={cn(
                                  "font-semibold",
                                  milestone.progress_percent === 100 ? "text-green-500" : "text-muted-foreground"
                                )}>
                                  {milestone.progress_percent}%
                                </span>
                              </div>
                              {contract.status !== 'completed' && contract.status !== 'cancelled' && (
                                <div className="flex items-center gap-3">
                                  <Slider
                                    value={[milestone.progress_percent || 0]}
                                    max={100}
                                    step={10}
                                    className="flex-1"
                                    disabled={updatingMilestoneId === milestone.id}
                                    onValueCommit={(value) => updateMilestoneProgress(milestone.id, contract.id, value[0])}
                                  />
                                  <div className="flex gap-1">
                                    {[0, 50, 100].map(val => (
                                      <Button
                                        key={val}
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                          "h-6 w-10 text-[10px] p-0",
                                          milestone.progress_percent === val && "bg-primary text-primary-foreground"
                                        )}
                                        disabled={updatingMilestoneId === milestone.id}
                                        onClick={() => updateMilestoneProgress(milestone.id, contract.id, val)}
                                      >
                                        {val}%
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No milestones yet. Add milestones to track progress.</p>
                      )}
                    </div>

                    {/* Footer - Budget & Dates */}
                    <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-4">
                        {(contract.budget_min || contract.budget_max) && (
                          <span className="flex items-center gap-1 text-primary">
                            <Coins className="w-3 h-3" />
                            {contract.budget_min && contract.budget_max 
                              ? `${contract.budget_min.toLocaleString()} - ${contract.budget_max.toLocaleString()}`
                              : (contract.budget_max || contract.budget_min)?.toLocaleString()
                            } {contract.currency || 'RELAY'}
                          </span>
                        )}
                        {contract.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Due {formatDistanceToNow(new Date(contract.deadline), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      {contract.status === 'completed' && contract.completed_at && (
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircle className="w-3 h-3" />
                          Completed {formatDistanceToNow(new Date(contract.completed_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {filteredContracts.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No contracts found</h3>
                <p className="text-muted-foreground mb-4">
                  {filter !== 'all' ? 'Try a different filter' : 'Create your first collaboration contract'}
                </p>
                {filter === 'all' && (
                  <Button onClick={() => setIsNewContractOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Contract
                  </Button>
                )}
              </div>
            )}
          </div>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="h-10 bg-muted rounded-lg animate-pulse" />
            <div className="h-32 bg-muted rounded-lg animate-pulse" />
            <div className="h-32 bg-muted rounded-lg animate-pulse" />
          </div>
        )}
      </div>

      {/* New Contract Dialog */}
      <NewContractDialog
        open={isNewContractOpen}
        onOpenChange={setIsNewContractOpen}
        agents={agents}
        onSuccess={handleContractCreated}
      />

      {/* Add Milestone Dialog */}
      <Dialog open={!!addMilestoneContractId} onOpenChange={(open) => { if (!open) { setAddMilestoneContractId(null); setNewMilestoneTitle('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
            <DialogDescription>Add a new milestone to track progress on this contract.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="milestone-title">Milestone Title</Label>
              <Input
                id="milestone-title"
                placeholder="e.g., Complete design mockups"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && addMilestoneContractId) {
                    addMilestone(addMilestoneContractId)
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAddMilestoneContractId(null); setNewMilestoneTitle('') }}>
                Cancel
              </Button>
              <Button
                onClick={() => addMilestoneContractId && addMilestone(addMilestoneContractId)}
                disabled={!newMilestoneTitle.trim() || isAddingMilestone}
              >
                {isAddingMilestone ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4 mr-2" />
                )}
                Add Milestone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
