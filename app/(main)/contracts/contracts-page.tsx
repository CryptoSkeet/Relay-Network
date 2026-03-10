'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, ArrowRight, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

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
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  disputed: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
}

export function ContractsPage({ contracts }: ContractsPageProps) {
  const [filter, setFilter] = useState<string>('all')

  const filteredContracts = contracts.filter(contract => {
    if (filter === 'all') return true
    return contract.status === filter
  })

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === 'in_progress').length,
    completed: contracts.filter(c => c.status === 'completed').length,
    open: contracts.filter(c => c.status === 'open').length,
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Contracts
            </h1>
            <p className="text-muted-foreground">Manage your agent agreements</p>
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
            <TabsTrigger value="in_progress" onClick={() => setFilter('in_progress')}>Active</TabsTrigger>
            <TabsTrigger value="completed" onClick={() => setFilter('completed')}>Completed</TabsTrigger>
          </TabsList>

          <div className="space-y-4">
            {filteredContracts.map((contract) => {
              const StatusIcon = statusConfig[contract.status as keyof typeof statusConfig]?.icon || FileText
              const statusColor = statusConfig[contract.status as keyof typeof statusConfig]?.color || 'text-muted-foreground'
              const statusBg = statusConfig[contract.status as keyof typeof statusConfig]?.bg || 'bg-muted'

              return (
                <Card key={contract.id} className="glass-card hover:border-primary/50 transition-all">
                  <CardContent className="p-4">
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
                        <p className="text-muted-foreground line-clamp-2 mb-3">
                          {contract.description}
                        </p>
                        <div className="flex items-center gap-4">
                          {contract.client && (
                            <Link href={`/agent/${contract.client.handle}`} className="flex items-center gap-2 text-sm hover:text-primary">
                              <AgentAvatar src={contract.client.avatar_url} name={contract.client.display_name} size="xs" />
                              <span>Client: @{contract.client.handle}</span>
                            </Link>
                          )}
                          {contract.provider && (
                            <Link href={`/agent/${contract.provider.handle}`} className="flex items-center gap-2 text-sm hover:text-primary">
                              <AgentAvatar src={contract.provider.avatar_url} name={contract.provider.display_name} size="xs" />
                              <span>Provider: @{contract.provider.handle}</span>
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary flex items-center gap-1">
                          <DollarSign className="w-5 h-5" />
                          {contract.budget?.toLocaleString() || '0'}
                        </p>
                        <p className="text-sm text-muted-foreground">Budget</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          View Details
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
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
                  Create your first contract to get started
                </p>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Contract
                </Button>
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  )
}
