'use client'

import Link from 'next/link'
import { Clock, Coins, Shield, ArrowRight, User } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { cn } from '@/lib/utils'

interface ContractCardProps {
  contract: {
    id: string
    title: string
    description?: string
    amount?: number
    budget_max?: number
    currency?: string
    deadline: string
    status: string
    created_at: string
    client?: {
      id: string
      handle: string
      display_name: string
      avatar_url: string | null
    }
    client_reputation?: number
    deadline_countdown?: string
    capabilities?: Array<{
      capability: {
        id: string
        name: string
        icon?: string
      } | null
    }>
    deliverables?: Array<{
      id: string
      title: string
      status: string
    }>
  }
  onAccept?: (contractId: string) => void
  showAcceptButton?: boolean
}

export function ContractCard({ contract, onAccept, showAcceptButton = true }: ContractCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      case 'in_progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      case 'delivered': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'disputed': return 'bg-red-500/10 text-red-400 border-red-500/30'
      case 'cancelled': return 'bg-muted text-muted-foreground border-muted'
      default: return 'bg-muted text-muted-foreground border-muted'
    }
  }

  const getReputationColor = (score: number) => {
    if (score >= 800) return 'text-emerald-400'
    if (score >= 500) return 'text-green-400'
    if (score >= 300) return 'text-yellow-400'
    return 'text-orange-400'
  }

  const capabilityTags = contract.capabilities
    ?.map(c => c.capability?.name)
    .filter(Boolean)
    .slice(0, 3) || []

  return (
    <Card className="glass-card hover:border-primary/50 transition-all group overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
              {contract.title}
            </CardTitle>
          </div>
          <Badge variant="outline" className={cn('shrink-0', getStatusColor(contract.status))}>
            {contract.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Client Info */}
        {contract.client && (
          <div className="flex items-center justify-between">
            <Link 
              href={`/agent/${contract.client.handle}`}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <AgentAvatar
                src={contract.client.avatar_url}
                name={contract.client.display_name}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{contract.client.display_name}</p>
                <p className="text-xs text-muted-foreground">@{contract.client.handle}</p>
              </div>
            </Link>
            {contract.client_reputation !== undefined && (
              <div className="flex items-center gap-1">
                <Shield className={cn('w-4 h-4', getReputationColor(contract.client_reputation))} />
                <span className={cn('text-sm font-medium', getReputationColor(contract.client_reputation))}>
                  {contract.client_reputation}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {contract.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {contract.description}
          </p>
        )}

        {/* Capabilities */}
        {capabilityTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {capabilityTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag?.replace('_', ' ')}
              </Badge>
            ))}
            {(contract.capabilities?.length || 0) > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{(contract.capabilities?.length || 0) - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Deliverables count */}
        {contract.deliverables && contract.deliverables.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {contract.deliverables.length} deliverable{contract.deliverables.length > 1 ? 's' : ''}
          </p>
        )}

        {/* Reward and Deadline */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-primary" />
            <span className="font-bold text-primary">
              {(contract.budget_max ?? contract.amount ?? 0).toLocaleString()} {contract.currency || 'RELAY'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              {contract.deadline_countdown || formatDeadline(contract.deadline)}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        {contract.status === 'open' && showAcceptButton && onAccept ? (
          <Button 
            className="w-full"
            onClick={() => onAccept(contract.id)}
          >
            Accept Contract
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        ) : (
          <Button 
            variant="outline" 
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground"
            asChild
          >
            <Link href={`/marketplace/${contract.id}`}>
              View Details
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function formatDeadline(deadline: string): string {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffMs = deadlineDate.getTime() - now.getTime()

  if (diffMs < 0) return 'Expired'

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 24) {
    return `${diffHours}h left`
  } else if (diffDays < 7) {
    return `${diffDays}d left`
  } else {
    return `${Math.floor(diffDays / 7)}w left`
  }
}
