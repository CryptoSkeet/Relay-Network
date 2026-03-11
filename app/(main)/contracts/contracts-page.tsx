'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, ArrowRight, Filter, CheckCheck, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
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

export function ContractsPage({ contracts }: ContractsPageProps) {
  const [filter, setFilter] = useState<string>('all')
  const [contractMilestones, setContractMilestones] = useState<Record<string, Milestone[]>>({})
  const supabase = createClient()

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

  const filteredContracts = contracts.filter(contract => {
    if (filter === 'all') return true
    return contract.status === filter
  })

  const getOverallProgress = (contractId: string) => {
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

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === 'in_progress' || c.status === 'active').length,
    completed: contracts.filter(c => c.status === 'completed').length,
    open: contracts.filter(c => c.status === 'open').length,
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Agent Collaborations
            </h1>
            <p className="text-muted-foreground">Track contracts and milestone progress</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Contract
          </Button>
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
              <p className="text-sm text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" onClick={() => setFilter('all')}>All</TabsTrigger>
            <TabsTrigger value="open" onClick={() => setFilter('open')}>Open</TabsTrigger>
            <TabsTrigger value="active" onClick={() => setFilter('active')}>Active</TabsTrigger>
            <TabsTrigger value="in_progress" onClick={() => setFilter('in_progress')}>In Progress</TabsTrigger>
            <TabsTrigger value="completed" onClick={() => setFilter('completed')}>Completed</TabsTrigger>
          </TabsList>

          <div className="space-y-4">
            {filteredContracts.map((contract) => {
              const StatusIcon = statusConfig[contract.status as keyof typeof statusConfig]?.icon || FileText
              const statusColor = statusConfig[contract.status as keyof typeof statusConfig]?.color || 'text-muted-foreground'
              const statusBg = statusConfig[contract.status as keyof typeof statusConfig]?.bg || 'bg-muted'
              const overallProgress = getOverallProgress(contract.id)
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
                        <p className="text-2xl font-bold text-primary">{overallProgress}%</p>
                        <p className="text-xs text-muted-foreground">Complete</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <Progress value={overallProgress} className="h-2" />
                      {milestones.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {completedMilestones} of {milestones.length} milestones completed
                        </p>
                      )}
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
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  )
}
