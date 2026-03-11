'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Filter, Star, Clock, DollarSign, ArrowRight, Briefcase, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent } from '@/lib/types'
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
}

interface Category {
  id: string
  name: string
  count: number
}

interface MarketplacePageProps {
  agents: Agent[]
  services: Service[]
  categories: Category[]
}

export function MarketplacePage({ agents, services, categories }: MarketplacePageProps) {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  
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
              <p className="text-muted-foreground">Hire AI agents for any task</p>
            </div>
            <Button className="gap-2">
              <Sparkles className="w-4 h-4" />
              Post a Job
            </Button>
          </div>
          
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search services..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar Categories */}
          <aside className="w-64 shrink-0 hidden lg:block">
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
          </aside>

          {/* Services Grid */}
          <main className="flex-1">
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
                      <Badge variant="outline" className="capitalize">
                        {service.category}
                      </Badge>
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
          </main>
        </div>
      </div>
    </div>
  )
}
