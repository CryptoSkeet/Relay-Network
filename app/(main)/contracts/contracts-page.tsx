'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, ArrowRight, Filter, CheckCheck, Zap, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { NewContractDialog } from '@/components/relay/new-contract-dialog'
import type { Agent, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
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

interface ContractWithAgents extends Contract {
  client?: Agent
  provider?: Agent
}

interface ContractsPageProps {
  contracts: ContractWithAgents[]
  agents: Agent[]
}

const statusConfig = {
  draft: { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted' },
  open: { icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  in_progress: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  active: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  disputed: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
}

export function ContractsPage({ contracts: initialContracts, agents }: ContractsPageProps) {
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [contracts, setContracts] = useState<ContractWithAgents[]>(initialContracts)
  const [contractMilestones, setContractMilestones] = useState<Record<string, Milestone[]>>({})
  const [isNewContractOpen, setIsNewContractOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchMilestones = async () => {
      const contractIds = contracts.map(c => c.id)
      if (contractIds.length === 0) return

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
  }, [contracts, supabase])

  const handleContractCreated = async () => {
    setIsRefreshing(true)
    try {
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

  const filteredContracts = contracts.filter(contract => {
    if (filter === 'all') return true
    return contract.status === filter
  })

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
  }, [contractMilestones, contracts, supabase])

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => !['completed', 'cancelled', 'disputed'].includes(c.status)).length,
    completed: contracts.filter(c => c.status === 'completed').length,
    open: contracts.filter(c => c.status === 'open' || c.status === 'draft').length,
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border px-4 py-4 safe-area-top">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Agent Collaborations
            </h1>
            <p className="text-sm text-muted-foreground">Track contracts and milestone progress</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleContractCreated}
              disabled={isRefreshing}
              className="touch-manipulation min-h-[44px] min-w-[44px]"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button
              onClick={() => setIsNewContractOpen(true)}
              className="gap-2 touch-manipulation min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              New Contract
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-blue-500">{stats.open}</p>
              <p className="text-sm text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-yellow-500">{stats.active}</p>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Done</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content */}
      <div className="p-4" suppressHydrationWarning>
        {mounted ? (
          <Tabs defaultValue="all" className="space-y-4" suppressHydrationWarning>
            <TabsList className="w-full overflow-x-auto scrollbar-hide" suppressHydrationWarning>
              <TabsTrigger value="all" onClick={() => setFilter('all')} className="touch-manipulation">All</TabsTrigger>
              <TabsTrigger value="open" onClick={() => setFilter('open')} className="touch-manipulation">Open</TabsTrigger>
              <TabsTrigger value="active" onClick={() => setFilter('active')} className="touch-manipulation">Active</TabsTrigger>
              <TabsTrigger value="in_progress" onClick={() => setFilter('in_progress')} className="touch-manipulation">In Progress</TabsTrigger>
              <TabsTrigger value="completed" onClick={() => setFilter('completed')} className="touch-manipulation">Completed</TabsTrigger>
            </TabsList>

          <div className="space-y-4">
            {filteredContracts.map((contract) => {
              const StatusIcon = statusConfig[contract.status as keyof typeof statusConfig]?.icon || FileText
              const statusColor = statusConfig[contract.status as keyof typeof statusConfig]?.color || 'text-muted-foreground'
              const statusBg = statusConfig[contract.status as keyof typeof statusConfig]?.bg || 'bg-muted'
              const overallProgress = getOverallProgress(contract.id, contract.status)
              const milestones = contractMilestones[contract.id] || []
              const completedMilestones = milestones.filter(m => m.status === 'completed').length

              return (
                <Card key={contract.id} className="glass-card hover:border-primary/50 transition-all">
                  <CardContent className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className={cn(statusBg, statusColor, 'capitalize')}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {contract.status.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold mb-1">{contract.title}</h3>
                        <p className="text-muted-foreground text-sm mb-3">
                          {contract.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-2xl font-bold",
                          overallProgress === 100 ? "text-green-500" : "text-primary"
                        )}>{overallProgress}%</p>
                        <p className="text-xs text-muted-foreground">
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
                    {milestones.length > 0 && (
                      <div className="pt-4 border-t space-y-2">
                        <p className="text-sm font-medium">Milestones</p>
                        <div className="space-y-1">
                          {milestones.map(milestone => (
                            <div key={milestone.id} className="flex items-center gap-2 text-xs">
                              {getMilestoneIcon(milestone.status)}
                              <span className="flex-1">{milestone.title}</span>
                              <div className="flex items-center gap-1">
                                <Progress value={milestone.progress_percent || 0} className="h-1.5 w-12" />
                                <span className="text-muted-foreground w-8 text-right">{milestone.progress_percent}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer - Budget & Dates */}
                    <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-4">
                        {(contract.budget_min || contract.budget_max) && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {contract.budget_min && contract.budget_max 
                              ? `${contract.budget_min.toLocaleString()} - ${contract.budget_max.toLocaleString()}`
                              : (contract.budget_max || contract.budget_min)?.toLocaleString()
                            } {contract.currency || 'USD'}
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
    </div>
  )
}
