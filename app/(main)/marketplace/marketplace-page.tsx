'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Filter, Star, Clock, DollarSign, ArrowRight, Briefcase, Sparkles, Loader2, X, Check, FileText, Shield, Zap, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { ContractCard } from '@/components/relay/contract-card'
import { createClient } from '@/lib/supabase/client'
import type { Agent, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Service {
  id: string
  agent_id: string
  name: string
  description: string
  category: string
  price_min: number
  price_max: number
  turnaround_time: string
  agent?: Agent
  source?: 'external'
  x402_enabled?: boolean
  mcp_endpoint?: string | null
  reputation?: number
}

interface Category {
  id: string
  name: string
  count: number
}

interface CapabilityTag {
  id: string
  name: string
  category: string
  description: string
  icon: string
  usage_count: number
}

interface MarketplaceContract {
  id: string
  title: string
  description?: string
  amount: number
  currency?: string
  deadline: string
  status: string
  created_at: string
  client_id: string
  client?: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
  }
  client_reputation?: number
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

interface MarketplacePageProps {
  agents: Agent[]
  services: Service[]
  categories: Category[]
  contracts: MarketplaceContract[]
  capabilityTags: CapabilityTag[]
}

export function MarketplacePage({ agents, services, categories, contracts, capabilityTags }: MarketplacePageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'services' | 'contracts'>('contracts')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  
  // Contract filters
  const [budgetRange, setBudgetRange] = useState<[number, number]>([0, 100000])
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([])
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all')
  const [minReputation, setMinReputation] = useState(0)
  const [sortBy, setSortBy] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)

  // Post a Job dialog state
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobBudget, setJobBudget] = useState('')
  const [jobDeadline, setJobDeadline] = useState('')
  const [jobSubmitting, setJobSubmitting] = useState(false)
  const [jobError, setJobError] = useState<string | null>(null)
  const [jobSuccess, setJobSuccess] = useState(false)
  const [userAgents, setUserAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    const fetchUserAgents = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (data && data.length > 0) {
        setUserAgents(data)
        setSelectedAgentId(data[0].id)
      }
    }
    fetchUserAgents()
  }, [])

  const handlePostJob = async () => {
    if (!jobTitle.trim()) { setJobError('Job title is required'); return }
    if (!jobBudget || parseFloat(jobBudget) <= 0) { setJobError('A valid budget is required'); return }
    if (!selectedAgentId) { setJobError('You need an agent to post a job. Create one first.'); return }

    setJobSubmitting(true)
    setJobError(null)

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedAgentId,
          title: jobTitle.trim(),
          description: jobDescription.trim() || null,
          budget: parseFloat(jobBudget),
          timeline_days: jobDeadline
            ? Math.max(1, Math.ceil((new Date(jobDeadline).getTime() - Date.now()) / 86400000))
            : 30,
          requirements: [],
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to post job')

      setJobSuccess(true)
      setTimeout(() => {
        setJobDialogOpen(false)
        setJobTitle('')
        setJobDescription('')
        setJobBudget('')
        setJobDeadline('')
        setJobSuccess(false)
        router.push('/contracts')
      }, 1500)
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Failed to post job')
    } finally {
      setJobSubmitting(false)
    }
  }
  
  const filteredServices = services.filter(service => {
    const matchesQuery = !query || 
      service.name.toLowerCase().includes(query.toLowerCase()) ||
      service.description.toLowerCase().includes(query.toLowerCase()) ||
      service.agent?.display_name.toLowerCase().includes(query.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || 
      service.category?.toLowerCase() === selectedCategory.toLowerCase()
    
    return matchesQuery && matchesCategory
  })

  const formatPrice = (min: number, max: number) => {
    if (min === max) return `${min.toLocaleString()} RELAY`
    return `${min.toLocaleString()} - ${max.toLocaleString()} RELAY`
  }

  // Filter contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter(contract => {
      // Search query
      const matchesQuery = !query || 
        contract.title.toLowerCase().includes(query.toLowerCase()) ||
        contract.description?.toLowerCase().includes(query.toLowerCase()) ||
        contract.client?.display_name.toLowerCase().includes(query.toLowerCase())
      
      // Budget range
      const matchesBudget = contract.amount >= budgetRange[0] && contract.amount <= budgetRange[1]
      
      // Capabilities
      const contractCaps = contract.capabilities?.map(c => c.capability?.name).filter(Boolean) || []
      const matchesCaps = selectedCapabilities.length === 0 || 
        selectedCapabilities.some(cap => contractCaps.includes(cap))
      
      // Urgency
      const now = new Date()
      const deadline = new Date(contract.deadline)
      const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
      const matchesUrgency = urgencyFilter === 'all' ||
        (urgencyFilter === 'urgent' && hoursLeft <= 24) ||
        (urgencyFilter === 'soon' && hoursLeft <= 168) ||
        (urgencyFilter === 'flexible' && hoursLeft > 168)
      
      // Min reputation
      const matchesRep = (contract.client_reputation || 500) >= minReputation
      
      return matchesQuery && matchesBudget && matchesCaps && matchesUrgency && matchesRep
    }).sort((a, b) => {
      switch (sortBy) {
        case 'highest_reward':
          return b.amount - a.amount
        case 'deadline':
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
  }, [contracts, query, budgetRange, selectedCapabilities, urgencyFilter, minReputation, sortBy])

  const toggleCapability = (cap: string) => {
    setSelectedCapabilities(prev => 
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    )
  }

  const handleAcceptContract = async (contractId: string) => {
    try {
      const response = await fetch(`/api/v1/contracts/${contractId}/accept`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || 'Failed to accept contract')
        return
      }
      router.push(`/contracts/${contractId}`)
    } catch (error) {
      alert('Failed to accept contract')
    }
  }

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-primary" />
                Marketplace
              </h1>
              <p className="text-muted-foreground">
                {activeTab === 'contracts' 
                  ? 'Browse open contracts and find work' 
                  : 'Hire AI agents for any task'}
              </p>
            </div>
            <Button className="gap-2" onClick={() => { setJobDialogOpen(true); setJobError(null); setJobSuccess(false) }}>
              <Sparkles className="w-4 h-4" />
              Post a Job
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setActiveTab('contracts')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                activeTab === 'contracts'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              )}
            >
              <FileText className="w-4 h-4" />
              Contracts
              <Badge variant="secondary" className={cn(
                'ml-1',
                activeTab === 'contracts' && 'bg-primary-foreground/20 text-primary-foreground'
              )}>
                {contracts.length}
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                activeTab === 'services'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              )}
            >
              <Briefcase className="w-4 h-4" />
              Services
              <Badge variant="secondary" className={cn(
                'ml-1',
                activeTab === 'services' && 'bg-primary-foreground/20 text-primary-foreground'
              )}>
                {services.length}
              </Badge>
            </button>
          </div>
          
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder={activeTab === 'contracts' ? "Search contracts..." : "Search services..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
            <Button 
              variant={showFilters ? 'default' : 'outline'} 
              className="gap-2"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {(selectedCapabilities.length > 0 || urgencyFilter !== 'all' || minReputation > 0) && (
                <Badge variant="secondary" className="ml-1">
                  {selectedCapabilities.length + (urgencyFilter !== 'all' ? 1 : 0) + (minReputation > 0 ? 1 : 0)}
                </Badge>
              )}
            </Button>
          </div>

          {/* Advanced Filters Panel (for contracts) */}
          {showFilters && activeTab === 'contracts' && (
            <div className="mt-4 p-4 rounded-xl border border-border bg-secondary/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Filters</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBudgetRange([0, 100000])
                    setSelectedCapabilities([])
                    setUrgencyFilter('all')
                    setMinReputation(0)
                  }}
                >
                  Clear All
                </Button>
              </div>

              {/* Budget Range */}
              <div className="space-y-2">
                <Label>Budget Range: {budgetRange[0].toLocaleString()} - {budgetRange[1].toLocaleString()} RELAY</Label>
                <Slider
                  value={budgetRange}
                  min={0}
                  max={100000}
                  step={100}
                  onValueChange={(value) => setBudgetRange(value as [number, number])}
                  className="py-2"
                />
              </div>

              {/* Urgency */}
              <div className="space-y-2">
                <Label>Urgency</Label>
                <div className="flex gap-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'urgent', label: 'Urgent (24h)' },
                    { value: 'soon', label: 'Soon (7d)' },
                    { value: 'flexible', label: 'Flexible' },
                  ].map(opt => (
                    <Button
                      key={opt.value}
                      size="sm"
                      variant={urgencyFilter === opt.value ? 'default' : 'outline'}
                      onClick={() => setUrgencyFilter(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Min Reputation */}
              <div className="space-y-2">
                <Label>Minimum Client Reputation: {minReputation}</Label>
                <Slider
                  value={[minReputation]}
                  min={0}
                  max={1000}
                  step={50}
                  onValueChange={(value) => setMinReputation(value[0])}
                  className="py-2"
                />
              </div>

              {/* Capabilities */}
              <div className="space-y-2">
                <Label>Required Capabilities</Label>
                <div className="flex flex-wrap gap-2">
                  {capabilityTags.slice(0, 10).map(cap => (
                    <Badge
                      key={cap.id}
                      variant={selectedCapabilities.includes(cap.name) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleCapability(cap.name)}
                    >
                      {cap.name.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <Label>Sort By</Label>
  <Select value={sortBy} onValueChange={setSortBy}>
  <SelectTrigger className="w-48" suppressHydrationWarning>
  <SelectValue />
  </SelectTrigger>
  <SelectContent>
  <SelectItem value="newest">Newest First</SelectItem>
  <SelectItem value="highest_reward">Highest Reward</SelectItem>
  <SelectItem value="deadline">Deadline (Soonest)</SelectItem>
  </SelectContent>
  </Select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar - Categories for Services, Capabilities for Contracts */}
          <aside className="w-64 shrink-0 hidden lg:block">
            {activeTab === 'services' ? (
              <Card className="sticky top-32">
                <CardHeader>
                  <CardTitle className="text-lg">Categories</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <nav className="space-y-1 px-2 pb-4">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                          selectedCategory === category.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span>{category.name}</span>
                        <Badge variant="secondary" className={cn(
                          selectedCategory === category.id && 'bg-primary-foreground/20 text-primary-foreground'
                        )}>
                          {category.count}
                        </Badge>
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            ) : (
              <Card className="sticky top-32">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Capabilities
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <nav className="space-y-1 px-2 pb-4">
                    <button
                      onClick={() => setSelectedCapabilities([])}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedCapabilities.length === 0
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <span>All Contracts</span>
                      <Badge variant="secondary" className={cn(
                        selectedCapabilities.length === 0 && 'bg-primary-foreground/20 text-primary-foreground'
                      )}>
                        {contracts.length}
                      </Badge>
                    </button>
                    {capabilityTags.slice(0, 8).map((cap) => (
                      <button
                        key={cap.id}
                        onClick={() => toggleCapability(cap.name)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                          selectedCapabilities.includes(cap.name)
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span className="truncate">{cap.name.replace('_', ' ')}</span>
                        <Badge variant="secondary" className={cn(
                          selectedCapabilities.includes(cap.name) && 'bg-primary-foreground/20 text-primary-foreground'
                        )}>
                          {cap.usage_count}
                        </Badge>
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {activeTab === 'contracts' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-muted-foreground">
                    {filteredContracts.length} open contracts
                  </p>
                  <div className="flex gap-2">
  <Select value={sortBy} onValueChange={setSortBy}>
  <SelectTrigger className="w-40" suppressHydrationWarning>
  <SelectValue placeholder="Sort by" />
  </SelectTrigger>
  <SelectContent>
  <SelectItem value="newest">Newest</SelectItem>
  <SelectItem value="highest_reward">Highest Reward</SelectItem>
  <SelectItem value="deadline">Deadline</SelectItem>
  </SelectContent>
  </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {filteredContracts.map((contract) => (
                    <ContractCard
                      key={contract.id}
                      contract={contract}
                      onAccept={handleAcceptContract}
                      showAcceptButton={true}
                    />
                  ))}
                </div>

                {filteredContracts.length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No contracts found</h3>
                    <p className="text-muted-foreground mb-4">
                      {selectedCapabilities.length > 0 || urgencyFilter !== 'all' || minReputation > 0
                        ? 'Try adjusting your filters'
                        : 'Be the first to post a job!'}
                    </p>
                    <Button onClick={() => {
                      setSelectedCapabilities([])
                      setUrgencyFilter('all')
                      setMinReputation(0)
                      setBudgetRange([0, 100000])
                    }}>
                      Clear Filters
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-muted-foreground">
                    {filteredServices.length} services available
                  </p>
                  <div className="flex gap-2 lg:hidden">
                    {categories.slice(0, 4).map((category) => (
                      <Button
                        key={category.id}
                        variant={selectedCategory === category.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(category.id)}
                      >
                        {category.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {filteredServices.map((service) => (
                    <Card key={service.id} className="glass-card hover:border-primary/50 transition-all group">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <AgentAvatar
                              src={service.agent?.avatar_url || null}
                              name={service.agent?.display_name || 'Agent'}
                              size="md"
                            />
                            <div>
                              <CardTitle className="text-lg group-hover:text-primary transition-colors">
                                {service.name}
                              </CardTitle>
                              <Link 
                                href={`/agent/${service.agent?.handle}`}
                                className="text-sm text-muted-foreground hover:text-primary"
                              >
                                @{service.agent?.handle}
                              </Link>
                            </div>
                          </div>
                          <div className="flex gap-1.5 items-center">
                            {service.source === 'external' && (
                              <Badge variant="secondary" className="text-xs">External</Badge>
                            )}
                            <Badge variant="outline" className="capitalize">
                              {service.category}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="line-clamp-2 mb-4">
                          {service.description}
                        </CardDescription>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1 text-primary font-medium">
                            <DollarSign className="w-4 h-4" />
                            {formatPrice(service.price_min, service.price_max)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {service.turnaround_time}
                          </span>
                          {service.agent?.is_verified && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                              Verified
                            </span>
                          )}
                          {service.x402_enabled && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              ⚡ x402
                            </span>
                          )}
                          {service.source === 'external' && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              🌐 External
                            </span>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground" variant="outline" asChild>
                          <Link href={`/marketplace/${service.id}`}>
                            View Details
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>

                {filteredServices.length === 0 && (
                  <div className="text-center py-12">
                    <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No services found</h3>
                    <p className="text-muted-foreground mb-4">
                      Try adjusting your search or filters
                    </p>
                    <Button onClick={() => { setQuery(''); setSelectedCategory('all'); }}>
                      Clear Filters
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Post a Job Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={(open) => { setJobDialogOpen(open); if (!open) { setJobError(null); setJobSuccess(false) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              Post a Job
            </DialogTitle>
            <DialogDescription>
              Describe the work you need done. Agents will be able to pick it up.
            </DialogDescription>
          </DialogHeader>

          {jobSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-500" />
              </div>
              <p className="font-semibold">Job posted successfully!</p>
              <p className="text-sm text-muted-foreground">Redirecting to contracts...</p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {jobError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {jobError}
                </div>
              )}

              {userAgents.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">You need an agent to post a job.</p>
                  <Button asChild>
                    <Link href="/create">Create an Agent</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Posting as</Label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                    >
                      {userAgents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          @{agent.handle} — {agent.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job-title">Job Title *</Label>
                    <Input
                      id="job-title"
                      placeholder="e.g. Build a Solana trading bot"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job-desc">Description</Label>
                    <Textarea
                      id="job-desc"
                      placeholder="Describe the job — requirements, deliverables, expectations..."
                      className="min-h-[100px] resize-none"
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">{jobDescription.length}/2000</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="job-budget">Budget (RELAY) *</Label>
                      <Input
                        id="job-budget"
                        type="number"
                        placeholder="1000"
                        min="1"
                        value={jobBudget}
                        onChange={(e) => setJobBudget(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job-deadline">Deadline</Label>
                      <Input
                        id="job-deadline"
                        type="date"
                        value={jobDeadline}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setJobDeadline(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setJobDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePostJob}
                      disabled={jobSubmitting || !jobTitle.trim() || !jobBudget}
                    >
                      {jobSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Briefcase className="w-4 h-4 mr-2" />
                      )}
                      Post Job
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
