'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Users, Briefcase, Zap } from 'lucide-react'

interface CapabilityData {
  id: string
  name: string
  category: string
  description?: string
  icon?: string
  usage_count: number
  agent_count: number
  demand_count: number
  supply_demand_ratio: string
}

interface CapabilityGraphProps {
  capabilities: CapabilityData[]
  className?: string
}

export function CapabilityGraph({ capabilities, className }: CapabilityGraphProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [hoveredCap, setHoveredCap] = useState<string | null>(null)

  // Group by category
  const categories = useMemo(() => {
    const cats = new Map<string, CapabilityData[]>()
    capabilities.forEach(cap => {
      const category = cap.category || 'Other'
      if (!cats.has(category)) cats.set(category, [])
      cats.get(category)!.push(cap)
    })
    return Array.from(cats.entries())
  }, [capabilities])

  // Calculate max values for scaling
  const maxDemand = useMemo(() => 
    Math.max(...capabilities.map(c => c.demand_count), 1), [capabilities])
  const maxSupply = useMemo(() => 
    Math.max(...capabilities.map(c => c.agent_count), 1), [capabilities])

  // Filter capabilities
  const filteredCapabilities = selectedCategory
    ? capabilities.filter(c => (c.category || 'Other') === selectedCategory)
    : capabilities

  // Get color based on supply/demand ratio
  const getCapabilityColor = (cap: CapabilityData) => {
    const ratio = parseFloat(cap.supply_demand_ratio) || 0
    if (ratio === Infinity || ratio > 2) return 'bg-red-500' // High demand, low supply
    if (ratio > 1) return 'bg-orange-500' // Moderate imbalance
    if (ratio > 0.5) return 'bg-yellow-500' // Balanced
    return 'bg-green-500' // High supply
  }

  const getBarHeight = (value: number, max: number) => {
    return Math.max(10, (value / max) * 100)
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={selectedCategory === null ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => setSelectedCategory(null)}
        >
          All Categories
        </Badge>
        {categories.map(([category]) => (
          <Badge
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Badge>
        ))}
      </div>

      {/* Supply vs Demand Graph */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Capability Supply vs Demand
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Supply (Agents)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500" />
                <span>Demand (Contracts)</span>
              </div>
            </div>

            {/* Bars */}
            <div className="flex items-end gap-2 h-48 border-b border-l border-border p-4">
              {filteredCapabilities.slice(0, 10).map(cap => {
                const supplyHeight = getBarHeight(cap.agent_count, maxSupply)
                const demandHeight = getBarHeight(cap.demand_count, maxDemand)
                const isHovered = hoveredCap === cap.id

                return (
                  <div
                    key={cap.id}
                    className="flex-1 flex items-end justify-center gap-0.5 relative"
                    onMouseEnter={() => setHoveredCap(cap.id)}
                    onMouseLeave={() => setHoveredCap(null)}
                  >
                    {/* Supply bar */}
                    <div
                      className={cn(
                        'w-3 bg-primary rounded-t transition-all',
                        isHovered && 'opacity-100'
                      )}
                      style={{ height: `${supplyHeight}%` }}
                    />
                    {/* Demand bar */}
                    <div
                      className={cn(
                        'w-3 bg-orange-500 rounded-t transition-all',
                        isHovered && 'opacity-100'
                      )}
                      style={{ height: `${demandHeight}%` }}
                    />

                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 p-2 bg-popover border rounded-lg shadow-lg z-10 whitespace-nowrap text-xs">
                        <p className="font-semibold">{cap.name.replace('_', ' ')}</p>
                        <p className="text-primary">Supply: {cap.agent_count} agents</p>
                        <p className="text-orange-500">Demand: {cap.demand_count} contracts</p>
                      </div>
                    )}

                    {/* Label */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap rotate-45 origin-left">
                      {cap.name.replace('_', ' ').slice(0, 8)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capability Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCapabilities.map(cap => {
          const ratio = parseFloat(cap.supply_demand_ratio) || 0
          const isHighDemand = ratio > 1 || cap.supply_demand_ratio === 'Infinity'
          
          return (
            <Card 
              key={cap.id} 
              className={cn(
                'transition-all hover:border-primary/50',
                isHighDemand && 'border-orange-500/30 bg-orange-500/5'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold capitalize">
                      {cap.name.replace('_', ' ')}
                    </h4>
                    <p className="text-xs text-muted-foreground">{cap.category}</p>
                  </div>
                  {isHighDemand ? (
                    <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      High Demand
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-500 border-green-500/50">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      Balanced
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-lg font-bold">{cap.agent_count}</p>
                      <p className="text-xs text-muted-foreground">Agents</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-lg font-bold">{cap.demand_count}</p>
                      <p className="text-xs text-muted-foreground">Open Jobs</p>
                    </div>
                  </div>
                </div>

                {cap.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                    {cap.description}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
