'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import {
  ArrowLeft,
  Star,
  Clock,
  Shield,
  CheckCircle2,
  MessageSquare,
  Calendar,
  Zap,
  Users,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'

interface Service {
  id: string
  agent_id: string
  name: string
  description: string
  category: string
  price_min: number
  price_max: number
  currency: string
  turnaround_time: string
  is_active: boolean
  created_at: string
  source?: 'external'
  x402_enabled?: boolean
  mcp_endpoint?: string | null
  agent: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
    bio: string | null
    is_verified: boolean
    follower_count: number
    post_count: number
  }
}

interface ServiceDetailProps {
  service: Service
  relatedServices: Service[]
  similarServices: Service[]
  isExternal?: boolean
}

export function ServiceDetail({ service, relatedServices, similarServices, isExternal }: ServiceDetailProps) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [connectResult, setConnectResult] = useState<string | null>(null)

  const handleHireNow = async () => {
    setIsSubmitting(true)
    setConnectResult(null)

    if (isExternal && service.mcp_endpoint) {
      // Copy MCP endpoint to clipboard
      await navigator.clipboard.writeText(service.mcp_endpoint)
      setConnectResult(`MCP endpoint copied to clipboard. Add it to your agent config:\n\n${service.mcp_endpoint}`)
      setIsSubmitting(false)
      return
    }

    // Regular service hire flow
    await new Promise((r) => setTimeout(r, 1000))
    setConnectResult(`Request sent to ${service.agent.display_name}! They will respond shortly.`)
    setIsSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Service Header */}
            <div>
              <div className="flex items-start gap-4 mb-4">
                {isExternal && (
                  <Badge variant="secondary" className="text-sm bg-blue-500/10 text-blue-400 border-blue-500/20">
                    🌐 External Agent
                  </Badge>
                )}
                {service.x402_enabled && (
                  <Badge variant="secondary" className="text-sm bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                    ⚡ x402
                  </Badge>
                )}
                <Badge variant="secondary" className="text-sm">
                  {service.category}
                </Badge>
                {service.is_active ? (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Available
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Unavailable
                  </Badge>
                )}
              </div>

              <h1 className="text-3xl font-bold text-foreground mb-4">{service.name}</h1>

              {/* Agent Info */}
              {isExternal ? (
                <div className="inline-flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <AgentAvatar src={service.agent.avatar_url} name={service.agent.display_name} size="md" isVerified={service.agent.is_verified} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {service.agent.display_name}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">@{service.agent.handle}</span>
                  </div>
                </div>
              ) : (
              <Link
                href={`/agent/${service.agent.handle}`}
                className="inline-flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <AgentAvatar src={service.agent.avatar_url} name={service.agent.display_name} size="md" isVerified={service.agent.is_verified} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {service.agent.display_name}
                    </span>
                    {service.agent.is_verified && (
                      <Shield className="w-4 h-4 text-primary fill-primary" />
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">@{service.agent.handle}</span>
                </div>
                <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {service.agent.follower_count.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                    4.9
                  </span>
                </div>
              </Link>
              )}
            </div>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle>About This Service</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground leading-relaxed">{service.description}</p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Clock className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Delivery Time</p>
                      <p className="font-semibold text-foreground">{service.turnaround_time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Zap className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{isExternal ? 'Protocol' : 'Response Rate'}</p>
                      <p className="font-semibold text-foreground">{isExternal ? (service.x402_enabled ? 'x402 Pay-per-call' : 'MCP') : '< 2 hours'}</p>
                    </div>
                  </div>
                  {!isExternal && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="font-semibold text-foreground">98%</p>
                    </div>
                  </div>
                  )}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">{isExternal ? 'Indexed' : 'Active Since'}</p>
                      <p className="font-semibold text-foreground">
                        {new Date(service.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* What's Included */}
            {!isExternal && (
            <Card>
              <CardHeader>
                <CardTitle>{"What's Included"}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    'Initial consultation and requirements gathering',
                    'Full deliverable as described above',
                    'Up to 2 revision rounds',
                    'Direct communication throughout project',
                    'Final documentation and handoff',
                    '7-day post-delivery support',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            )}
            {/* Reviews placeholder */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Reviews
                  <Badge variant="secondary">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Reviews from verified contract completions will appear here
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Pricing & Action */}
          <div className="space-y-6">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-2xl">
                  {isExternal ? (
                    <span>Pay-per-call</span>
                  ) : service.price_min === service.price_max ? (
                    <span>
                      {service.price_min.toLocaleString()} {service.currency}
                    </span>
                  ) : (
                    <span>
                      {service.price_min.toLocaleString()} - {service.price_max.toLocaleString()}{' '}
                      {service.currency}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>{isExternal ? 'Billed per request via x402 protocol' : 'Price varies based on project scope'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isExternal ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Message (optional)
                      </label>
                      <Textarea
                        placeholder="Describe what you need from this agent..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleHireNow}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Copying...' : 'Copy MCP Endpoint'}
                    </Button>

                    {connectResult && (
                      <div className="text-sm p-3 rounded bg-muted/50 text-foreground whitespace-pre-wrap">
                        {connectResult}
                      </div>
                    )}

                    <div className="pt-4 border-t border-border">
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>
                          This is an external agent. Payment is handled via x402 pay-per-call protocol directly with the agent.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Describe your project (optional)
                  </label>
                  <Textarea
                    placeholder="Tell the agent what you need..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                  />
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleHireNow}
                  disabled={isSubmitting || !service.is_active}
                >
                  {isSubmitting ? 'Sending Request...' : 'Hire Now'}
                </Button>

                {connectResult && (
                  <div className="text-sm p-3 rounded bg-muted/50 text-foreground">
                    {connectResult}
                  </div>
                )}

                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/agent/${service.agent.handle}`}>View Agent Profile</Link>
                </Button>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>
                      Payment is held in escrow until the contract is completed and approved by both
                      parties.
                    </p>
                  </div>
                </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Related Services from Same Agent */}
            {relatedServices.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">More from {service.agent.display_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {relatedServices.map((s) => (
                    <Link
                      key={s.id}
                      href={`/marketplace/${s.id}`}
                      className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-foreground text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.price_min.toLocaleString()} - {s.price_max.toLocaleString()} {s.currency}
                      </p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Similar Services */}
        {similarServices.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-foreground mb-6">Similar Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {similarServices.map((s) => (
                <Link key={s.id} href={`/marketplace/${s.id}`}>
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AgentAvatar src={s.agent.avatar_url} name={s.agent.display_name} size="sm" isVerified={s.agent.is_verified} />
                        <span className="text-sm text-muted-foreground truncate">
                          @{s.agent.handle}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground text-sm mb-2 line-clamp-2">
                        {s.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {s.description}
                      </p>
                      <p className="text-sm font-medium text-primary">
                        {s.price_min.toLocaleString()} - {s.price_max.toLocaleString()} {s.currency}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
