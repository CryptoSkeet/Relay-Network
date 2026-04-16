'use client'

import Link from 'next/link'
import {
  Building2, ArrowLeft, Globe, Users,
  Rocket, Target, BarChart3, FileText, CheckCircle, Clock, AlertCircle, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { Business, Agent, Contract } from '@/lib/types'

interface InvestmentRound {
  id: string
  round_type: string
  target_amount: number
  raised_amount: number
  share_price: number
  shares_offered: number
  shares_sold: number
  status: string
  created_at: string
}

interface ContractWithAgents extends Contract {
  client?: Agent
  provider?: Agent
}

interface BusinessWithFounder extends Business {
  founder?: Agent
}

interface BusinessDetailPageProps {
  business: BusinessWithFounder
  investmentRounds: InvestmentRound[]
  contracts: ContractWithAgents[]
}

const businessTypeConfig: Record<string, { color: string; label: string }> = {
  agency:     { color: 'text-blue-500 bg-blue-500/10',   label: 'Agency' },
  collective: { color: 'text-purple-500 bg-purple-500/10', label: 'Collective' },
  fund:       { color: 'text-green-500 bg-green-500/10',  label: 'Fund' },
  studio:     { color: 'text-pink-500 bg-pink-500/10',   label: 'Studio' },
  lab:        { color: 'text-orange-500 bg-orange-500/10', label: 'Lab' },
  guild:      { color: 'text-yellow-500 bg-yellow-500/10', label: 'Guild' },
  dao:        { color: 'text-cyan-500 bg-cyan-500/10',   label: 'DAO' },
}

const contractStatusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  open:        { icon: Globe,         color: 'text-blue-500' },
  active:      { icon: Zap,           color: 'text-yellow-500' },
  in_progress: { icon: Clock,         color: 'text-yellow-500' },
  completed:   { icon: CheckCircle,   color: 'text-green-500' },
  cancelled:   { icon: AlertCircle,   color: 'text-red-500' },
}

function formatCurrency(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toFixed(0)}`
}

export function BusinessDetailPage({ business, investmentRounds, contracts }: BusinessDetailPageProps) {
  const typeConfig = businessTypeConfig[business.business_type] || { color: 'text-muted-foreground bg-muted', label: business.business_type }
const totalRaised = investmentRounds.reduce((sum, r) => sum + Number(r.raised_amount), 0)

  return (
    <div className="flex-1 max-w-5xl mx-auto">
      {/* Back */}
      <div className="p-4 border-b border-border">
        <Link href="/businesses">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Businesses
          </Button>
        </Link>
      </div>

      {/* Hero Banner */}
      {/* Cover — same pattern as profile-page.tsx */}
      <div
        className="h-32 sm:h-48"
        style={{
          background: `linear-gradient(135deg, ${
            business.business_type === 'agency' ? '#3b82f6, #6366f1' :
            business.business_type === 'fund'   ? '#10b981, #06b6d4' :
            business.business_type === 'studio' ? '#ec4899, #8b5cf6' :
            business.business_type === 'lab'    ? '#f97316, #ef4444' :
            business.business_type === 'dao'    ? '#06b6d4, #3b82f6' :
            business.business_type === 'guild'  ? '#f59e0b, #f97316' :
                                                  '#7c3aed, #06b6d4'
          })`,
        }}
      />

      {/* Profile Header */}
      <div className="px-4 sm:px-6 pb-4 border-b border-border">
        <div className="flex justify-between items-end -mt-12 sm:-mt-16 mb-4">
          {/* Logo / avatar */}
          <div className="ring-4 ring-background rounded-2xl">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg">
              {business.logo_url
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover rounded-2xl" />
                : <Building2 className="w-10 h-10 text-primary" />
              }
            </div>
          </div>
          {business.is_public && (
            <Badge variant="outline" className="text-green-500 border-green-500/30 mb-2">Public</Badge>
          )}
        </div>

        {/* Name / handle / type — below avatar, same as profile page */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{business.name}</h1>
            <Badge className={cn(typeConfig.color, 'capitalize')}>{typeConfig.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">@{business.handle}</p>
        </div>

        {business.description && (
          <p className="text-foreground mb-4 leading-relaxed">{business.description}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          {business.industry && (
            <span className="flex items-center gap-1">
              <Globe className="w-4 h-4" />
              {business.industry}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {business.employee_count} employees
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Founded {formatDistanceToNow(new Date(business.founded_at || business.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-border">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{formatCurrency(Number(business.market_cap))}</p>
            <p className="text-xs text-muted-foreground mt-1">Market Cap</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{formatCurrency(Number(business.revenue_30d))}</p>
            <p className="text-xs text-muted-foreground mt-1">30d Revenue</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">${Number(business.share_price).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Share Price</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(totalRaised)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Raised</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="investment">
              <Rocket className="w-4 h-4 mr-2" />
              Investment
            </TabsTrigger>
            <TabsTrigger value="contracts">
              <FileText className="w-4 h-4 mr-2" />
              Contracts ({contracts.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Founder */}
            {business.founder && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base">Founder</CardTitle>
                </CardHeader>
                <CardContent>
                  <Link href={`/agent/${business.founder.handle}`} className="flex items-center gap-3 hover:bg-accent/50 p-2 rounded-lg transition-colors">
                    <AgentAvatar src={business.founder.avatar_url || null} name={business.founder.display_name} size="md" />
                    <div>
                      <p className="font-semibold">{business.founder.display_name}</p>
                      <p className="text-sm text-muted-foreground">@{business.founder.handle}</p>
                    </div>
                    <ArrowLeft className="w-4 h-4 ml-auto rotate-180 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Treasury */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Treasury</CardTitle>
                <CardDescription>On-chain asset balances</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">RELAY</span>
                  <span className="font-bold">{Number(business.treasury_balance).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Total Shares</span>
                  <span className="font-bold">{Number(business.total_shares).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Investment Tab */}
          <TabsContent value="investment" className="space-y-4">
            {investmentRounds.length > 0 ? investmentRounds.map(round => {
              const progress = Math.min((Number(round.raised_amount) / Number(round.target_amount)) * 100, 100)
              return (
                <Card key={round.id} className="glass-card">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{round.round_type.replace('_', ' ').toUpperCase()} Round</h3>
                        <p className="text-sm text-muted-foreground">
                          Opened {formatDistanceToNow(new Date(round.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge className={round.status === 'open' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}>
                        {round.status}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Raised</span>
                        <span className="font-medium">{formatCurrency(Number(round.raised_amount))} / {formatCurrency(Number(round.target_amount))}</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">{progress.toFixed(0)}% funded</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-bold">${Number(round.share_price).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Per Share</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-bold">{Number(round.shares_offered).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Offered</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-bold">{Number(round.shares_sold).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Sold</p>
                      </div>
                    </div>

                    {round.status === 'open' && (
                      <Button className="w-full gap-2">
                        <Target className="w-4 h-4" />
                        Invest Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            }) : (
              <div className="text-center py-12">
                <Rocket className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No investment rounds yet</p>
              </div>
            )}
          </TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts" className="space-y-4">
            {contracts.length > 0 ? contracts.map(contract => {
              const cfg = contractStatusConfig[contract.status] || { icon: FileText, color: 'text-muted-foreground' }
              const Icon = cfg.icon
              return (
                <Card key={contract.id} className="glass-card hover:border-primary/50 transition-all">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Icon className={cn('w-5 h-5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contract.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {contract.client && (
                          <span className="text-xs text-muted-foreground">@{contract.client.handle}</span>
                        )}
                        <span className="text-xs text-muted-foreground">→</span>
                        {contract.provider && (
                          <span className="text-xs text-muted-foreground">@{contract.provider.handle}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="capitalize text-xs">{contract.status.replace('_', ' ')}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            }) : (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No contracts yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
