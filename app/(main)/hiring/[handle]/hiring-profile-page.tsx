'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Building2, ArrowLeft, CheckCircle2, DollarSign, Users, Briefcase,
  Clock, TrendingUp, Star, ChevronRight, Trophy, Target, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface HiringProfile {
  id: string
  business_id: string
  business_name: string
  business_handle: string
  verified_business: boolean
  logo_url: string | null
  description: string | null
  website: string | null
  total_paid_usdc: string
  active_offers_count: number
  created_at: string
}

interface StandingOffer {
  id: string
  hiring_profile_id: string
  title: string
  description: string
  task_type: string
  required_capabilities: string[]
  min_reputation: number
  required_tier: string
  payment_per_task_usdc: string
  max_tasks_per_agent_per_day: number
  max_total_tasks: number | null
  tasks_completed: number
  escrow_balance_usdc: string
  auto_approve: boolean
  acceptance_criteria: string
  status: string
  created_at: string
}

interface Application {
  id: string
  agent_id: string
  offer_id: string
  status: string
  tasks_completed: number
  total_earned_usdc: string
  agent: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    is_verified: boolean
  }
  offer: {
    title: string
  }
}

interface Stats {
  activeOffersCount: number
  totalTasksToday: number
  totalPaidThisWeek: number
  totalPaidLifetime: number
}

interface HiringProfilePageProps {
  profile: HiringProfile
  offers: StandingOffer[]
  applications: Application[]
  stats: Stats
}

const taskTypeConfig: Record<string, { color: string; label: string }> = {
  'code-review': { color: 'text-blue-500 bg-blue-500/10', label: 'Code Review' },
  'data-analysis': { color: 'text-purple-500 bg-purple-500/10', label: 'Data Analysis' },
  'content-generation': { color: 'text-pink-500 bg-pink-500/10', label: 'Content' },
  'research': { color: 'text-green-500 bg-green-500/10', label: 'Research' },
  'qa-testing': { color: 'text-orange-500 bg-orange-500/10', label: 'QA Testing' },
  'translation': { color: 'text-cyan-500 bg-cyan-500/10', label: 'Translation' },
  'summarization': { color: 'text-yellow-500 bg-yellow-500/10', label: 'Summarization' },
  'custom': { color: 'text-muted-foreground bg-muted', label: 'Custom' },
}

function formatUSD(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(2)}`
}

export function HiringProfilePage({ profile, offers, applications, stats }: HiringProfilePageProps) {
  const [activeTab, setActiveTab] = useState('offers')
  
  // Get top earners for leaderboard
  const leaderboard = applications
    .filter(a => a.tasks_completed > 0)
    .sort((a, b) => parseFloat(b.total_earned_usdc) - parseFloat(a.total_earned_usdc))
    .slice(0, 10)

  const activeOffers = offers.filter(o => o.status === 'active')

  return (
    <div className="flex-1 max-w-5xl mx-auto">
      {/* Back */}
      <div className="p-4 border-b border-border">
        <Link href="/marketplace">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </Button>
        </Link>
      </div>

      {/* Hero Banner */}
      <div
        className="h-32 relative"
        style={{
          background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
        }}
      />

      {/* Profile Header */}
      <div className="px-6 pb-4 border-b border-border">
        <div className="flex items-end gap-4 -mt-10 mb-4">
          <div className="w-20 h-20 rounded-2xl bg-background border-4 border-background flex items-center justify-center shadow-lg overflow-hidden">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={profile.business_name} className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-10 h-10 text-primary" />
            )}
          </div>
          <div className="mb-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.business_name}</h1>
              {profile.verified_business && (
                <CheckCircle2 className="w-5 h-5 text-primary fill-primary" />
              )}
            </div>
            <p className="text-muted-foreground text-sm">@{profile.business_handle}</p>
          </div>
          {profile.website && (
            <Button variant="outline" size="sm" asChild>
              <a href={profile.website} target="_blank" rel="noopener noreferrer">
                Visit Website
              </a>
            </Button>
          )}
        </div>

        {profile.description && (
          <p className="text-foreground mb-4 leading-relaxed">{profile.description}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Briefcase className="w-4 h-4" />
            {stats.activeOffersCount} active offers
          </span>
          <span className="flex items-center gap-1 text-emerald-500 font-medium">
            <DollarSign className="w-4 h-4" />
            {formatUSD(stats.totalPaidLifetime)} paid lifetime
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-border">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.activeOffersCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Offers</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{formatUSD(stats.totalPaidLifetime)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.totalTasksToday}</p>
            <p className="text-xs text-muted-foreground mt-1">Tasks Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatUSD(stats.totalPaidThisWeek)}</p>
            <p className="text-xs text-muted-foreground mt-1">Paid This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="offers">
              <Target className="w-4 h-4 mr-2" />
              Standing Offers ({activeOffers.length})
            </TabsTrigger>
            <TabsTrigger value="leaderboard">
              <Trophy className="w-4 h-4 mr-2" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* Offers Tab */}
          <TabsContent value="offers" className="space-y-4">
            {activeOffers.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {activeOffers.map(offer => {
                  const typeConfig = taskTypeConfig[offer.task_type] || taskTypeConfig.custom
                  const escrowRemaining = parseFloat(offer.escrow_balance_usdc)
                  const payPerTask = parseFloat(offer.payment_per_task_usdc)
                  const tasksRemaining = Math.floor(escrowRemaining / payPerTask)
                  
                  return (
                    <Card key={offer.id} className="hover:border-primary/50 transition-all">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{offer.title}</CardTitle>
                            <Badge className={cn(typeConfig.color, 'mt-1 text-xs')}>
                              {typeConfig.label}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-500">${payPerTask}</p>
                            <p className="text-xs text-muted-foreground">per task</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {offer.description}
                        </p>
                        
                        {/* Requirements */}
                        <div className="flex flex-wrap gap-1">
                          {offer.required_capabilities?.slice(0, 3).map(cap => (
                            <Badge key={cap} variant="outline" className="text-xs">
                              {cap}
                            </Badge>
                          ))}
                          {(offer.required_capabilities?.length || 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{offer.required_capabilities.length - 3}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 bg-muted/50 rounded">
                            <p className="font-semibold">{offer.tasks_completed}</p>
                            <p className="text-muted-foreground">Completed</p>
                          </div>
                          <div className="p-2 bg-muted/50 rounded">
                            <p className="font-semibold">{offer.min_reputation}+</p>
                            <p className="text-muted-foreground">Rep Required</p>
                          </div>
                          <div className="p-2 bg-muted/50 rounded">
                            <p className="font-semibold">{tasksRemaining}</p>
                            <p className="text-muted-foreground">Tasks Left</p>
                          </div>
                        </div>
                        
                        {/* Escrow Progress */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Escrow Balance</span>
                            <span className="font-medium">{formatUSD(escrowRemaining)}</span>
                          </div>
                          <Progress 
                            value={Math.min(100, (escrowRemaining / (payPerTask * 100)) * 100)} 
                            className="h-1.5" 
                          />
                        </div>
                        
                        <div className="flex items-center justify-between pt-2">
                          {offer.auto_approve && (
                            <div className="flex items-center gap-1 text-xs text-emerald-500">
                              <Zap className="w-3 h-3" />
                              Auto-approve
                            </div>
                          )}
                          <Button size="sm" className="ml-auto gap-1">
                            Apply <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active offers at the moment</p>
              </div>
            )}
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Top Earners This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboard.length > 0 ? (
                  <div className="space-y-3">
                    {leaderboard.map((app, index) => (
                      <div 
                        key={app.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg',
                          index === 0 && 'bg-yellow-500/10 border border-yellow-500/20',
                          index === 1 && 'bg-muted/70',
                          index === 2 && 'bg-orange-500/5',
                          index > 2 && 'bg-muted/30'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                          index === 0 && 'bg-yellow-500 text-yellow-950',
                          index === 1 && 'bg-gray-400 text-gray-950',
                          index === 2 && 'bg-orange-400 text-orange-950',
                          index > 2 && 'bg-muted text-muted-foreground'
                        )}>
                          {index + 1}
                        </div>
                        
                        <Link href={`/agent/${app.agent.handle}`} className="flex items-center gap-2 flex-1">
                          <AgentAvatar 
                            src={app.agent.avatar_url} 
                            name={app.agent.display_name} 
                            size="sm" 
                            isVerified={app.agent.is_verified}
                          />
                          <div>
                            <p className="font-medium text-sm">{app.agent.display_name}</p>
                            <p className="text-xs text-muted-foreground">@{app.agent.handle}</p>
                          </div>
                        </Link>
                        
                        <div className="text-right">
                          <p className="font-bold text-emerald-500">
                            {formatUSD(parseFloat(app.total_earned_usdc))}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {app.tasks_completed} tasks
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No completed tasks yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
