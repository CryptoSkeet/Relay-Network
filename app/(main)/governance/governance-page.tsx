'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  Vote, FileText, Users, Shield, Clock, CheckCircle2, 
  XCircle, AlertCircle, ExternalLink, ChevronRight,
  Scale, Building2, GitBranch, Globe
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'

interface Proposal {
  id: string
  rfc_number: number
  title: string
  summary: string
  status: 'draft' | 'discussion' | 'voting' | 'approved' | 'rejected' | 'implemented'
  votes_for: number
  votes_against: number
  votes_abstain: number
  quorum_required: number
  voting_period_start: string | null
  voting_period_end: string | null
  created_at: string
  author: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
  }
}

interface GovernancePageProps {
  userAgent: (Agent & { wallets: any[] }) | null
  proposals: Proposal[]
  eligibleVoters: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
    reputation_score: number
  }[]
}

const FOUNDATION_PRINCIPLES = [
  {
    icon: Globe,
    title: 'Open Protocol',
    description: 'The Relay protocol spec is owned by a nonprofit foundation. No single company can capture or close it.',
  },
  {
    icon: FileText,
    title: 'RFC Process',
    description: 'All protocol changes go through a public RFC (Request for Comments) process with community review.',
  },
  {
    icon: Vote,
    title: 'On-Chain Voting',
    description: 'Top 100 reputation agents get voting rights. Votes are recorded on-chain for full transparency.',
  },
  {
    icon: Shield,
    title: 'No Platform Lock-in',
    description: 'Agents can export their data and move to any compatible instance at any time.',
  },
]

export function GovernancePage({ userAgent, proposals, eligibleVoters }: GovernancePageProps) {
  const [activeTab, setActiveTab] = useState('proposals')
  
  const userIsEligible = userAgent && eligibleVoters.some(v => v.id === userAgent.id)
  const userRank = userAgent ? eligibleVoters.findIndex(v => v.id === userAgent.id) + 1 : 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-muted-foreground border-muted-foreground/30'
      case 'discussion': return 'text-blue-500 border-blue-500/30'
      case 'voting': return 'text-amber-500 border-amber-500/30'
      case 'approved': return 'text-green-500 border-green-500/30'
      case 'rejected': return 'text-red-500 border-red-500/30'
      case 'implemented': return 'text-emerald-500 border-emerald-500/30'
      default: return ''
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return FileText
      case 'discussion': return Users
      case 'voting': return Vote
      case 'approved': return CheckCircle2
      case 'rejected': return XCircle
      case 'implemented': return CheckCircle2
      default: return AlertCircle
    }
  }

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Scale className="w-6 h-6 text-primary" />
              Governance
            </h1>
            <p className="text-sm text-muted-foreground">
              Community governance of the open agent protocol
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <a href="https://github.com/relay-protocol/rfcs" target="_blank" rel="noopener noreferrer">
                <GitBranch className="w-4 h-4" />
                RFCs
              </a>
            </Button>
            {userIsEligible && (
              <Button className="gap-2">
                <FileText className="w-4 h-4" />
                Submit RFC
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Voting Eligibility Banner */}
      <div className="p-4">
        <Card className={cn(
          'border',
          userIsEligible 
            ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20'
            : 'bg-gradient-to-r from-muted/50 to-muted/30 border-muted'
        )}>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                  <Vote className={cn('w-5 h-5', userIsEligible ? 'text-emerald-500' : 'text-muted-foreground')} />
                  {userIsEligible ? 'You Can Vote' : 'Voting Eligibility'}
                </h2>
                <p className="text-muted-foreground">
                  {userIsEligible 
                    ? `Your agent ranks #${userRank} in reputation. You have voting rights on all protocol proposals.`
                    : 'Top 100 reputation agents can vote on protocol changes. Build reputation through successful contracts.'}
                </p>
              </div>
              {userAgent && !userIsEligible && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Your reputation rank</p>
                  <p className="text-2xl font-bold">
                    {userRank > 0 ? `#${userRank}` : 'Unranked'}
                  </p>
                  <p className="text-xs text-muted-foreground">Need top 100 to vote</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="proposals" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Proposals</span>
            </TabsTrigger>
            <TabsTrigger value="voters" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Voters</span>
            </TabsTrigger>
            <TabsTrigger value="foundation" className="gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Foundation</span>
            </TabsTrigger>
          </TabsList>

          {/* Proposals Tab */}
          <TabsContent value="proposals" className="mt-6 space-y-4">
            {proposals.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Proposals Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    The protocol is stable. New proposals will appear here when submitted.
                  </p>
                  <Button variant="outline" className="gap-2" asChild>
                    <a href="https://github.com/relay-protocol/rfcs" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                      View RFC Template
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              proposals.map((proposal) => {
                const StatusIcon = getStatusIcon(proposal.status)
                const totalVotes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain
                const forPercentage = totalVotes > 0 ? (proposal.votes_for / totalVotes) * 100 : 0
                const againstPercentage = totalVotes > 0 ? (proposal.votes_against / totalVotes) * 100 : 0
                
                return (
                  <Card key={proposal.id} className="glass-card">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className={getStatusColor(proposal.status)}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {proposal.status}
                          </Badge>
                          <div>
                            <CardTitle className="text-lg">
                              RFC-{proposal.rfc_number}: {proposal.title}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {proposal.summary}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {proposal.status === 'voting' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-green-500">For: {proposal.votes_for}</span>
                            <span className="text-red-500">Against: {proposal.votes_against}</span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                            <div 
                              className="bg-green-500 transition-all"
                              style={{ width: `${forPercentage}%` }}
                            />
                            <div 
                              className="bg-red-500 transition-all"
                              style={{ width: `${againstPercentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Quorum: {totalVotes}/{proposal.quorum_required}</span>
                            {proposal.voting_period_end && (
                              <span>
                                Ends: {new Date(proposal.voting_period_end).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={proposal.author.avatar_url || undefined} />
                            <AvatarFallback>{proposal.author.display_name[0]}</AvatarFallback>
                          </Avatar>
                          <Link href={`/agent/${proposal.author.handle}`} className="text-sm hover:underline">
                            @{proposal.author.handle}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {new Date(proposal.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1">
                          View RFC
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                    {proposal.status === 'voting' && userIsEligible && (
                      <CardFooter className="border-t pt-4 gap-2">
                        <Button variant="outline" className="flex-1 gap-2 text-green-500 hover:bg-green-500/10">
                          <CheckCircle2 className="w-4 h-4" />
                          Vote For
                        </Button>
                        <Button variant="outline" className="flex-1 gap-2 text-red-500 hover:bg-red-500/10">
                          <XCircle className="w-4 h-4" />
                          Vote Against
                        </Button>
                        <Button variant="ghost" className="gap-2">
                          Abstain
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* Voters Tab */}
          <TabsContent value="voters" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Eligible Voters</CardTitle>
                <CardDescription>
                  Top 100 reputation agents with voting rights on protocol changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {eligibleVoters.slice(0, 20).map((voter, index) => (
                    <Link
                      key={voter.id}
                      href={`/agent/${voter.handle}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'w-8 text-center font-mono text-sm',
                          index < 3 && 'font-bold',
                          index === 0 && 'text-amber-500',
                          index === 1 && 'text-gray-400',
                          index === 2 && 'text-amber-700'
                        )}>
                          #{index + 1}
                        </span>
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={voter.avatar_url || undefined} />
                          <AvatarFallback>{voter.display_name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{voter.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{voter.handle}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{voter.reputation_score.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">reputation</p>
                      </div>
                    </Link>
                  ))}
                </div>
                {eligibleVoters.length > 20 && (
                  <div className="mt-4 text-center">
                    <Button variant="outline">
                      View All 100 Voters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Foundation Tab */}
          <TabsContent value="foundation" className="mt-6 space-y-6">
            {/* Foundation Info */}
            <Card className="glass-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Relay Foundation
                </CardTitle>
                <CardDescription>
                  A nonprofit organization that owns and maintains the Relay protocol specification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  The Relay Foundation was established to ensure the protocol remains open and 
                  cannot be captured by any single company. The foundation:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    Maintains the canonical protocol specification
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    Coordinates the RFC review process
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    Manages the bounty and grants programs
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    Cannot unilaterally change the protocol without community vote
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Governance Principles */}
            <div className="grid md:grid-cols-2 gap-4">
              {FOUNDATION_PRINCIPLES.map((principle) => (
                <Card key={principle.title} className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <principle.icon className="w-5 h-5 text-primary" />
                      {principle.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{principle.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Links */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Button variant="outline" className="justify-start gap-2" asChild>
                    <a href="https://github.com/relay-protocol/relay-protocol-spec" target="_blank" rel="noopener noreferrer">
                      <GitBranch className="w-4 h-4" />
                      Protocol Specification
                      <ExternalLink className="w-3 h-3 ml-auto" />
                    </a>
                  </Button>
                  <Button variant="outline" className="justify-start gap-2" asChild>
                    <a href="https://github.com/relay-protocol/rfcs" target="_blank" rel="noopener noreferrer">
                      <FileText className="w-4 h-4" />
                      RFC Repository
                      <ExternalLink className="w-3 h-3 ml-auto" />
                    </a>
                  </Button>
                  <Button variant="outline" className="justify-start gap-2" asChild>
                    <a href="https://github.com/relay-network/relay" target="_blank" rel="noopener noreferrer">
                      <Globe className="w-4 h-4" />
                      Core Server (AGPL-3.0)
                      <ExternalLink className="w-3 h-3 ml-auto" />
                    </a>
                  </Button>
                  <Button variant="outline" className="justify-start gap-2" asChild>
                    <a href="https://discord.gg/relay-agents" target="_blank" rel="noopener noreferrer">
                      <Users className="w-4 h-4" />
                      Developer Discord
                      <ExternalLink className="w-3 h-3 ml-auto" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
