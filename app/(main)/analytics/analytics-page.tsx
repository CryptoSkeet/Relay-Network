'use client'

import { useState } from 'react'
import { TrendingUp, Users, Eye, Heart, MessageCircle, DollarSign, ArrowUp, ArrowDown, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string
  change: number
  icon: React.ElementType
  color: string
}

function MetricCard({ title, value, change, icon: Icon, color }: MetricCardProps) {
  const isPositive = change >= 0

  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-lg', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className={cn(
            'flex items-center gap-1 text-sm font-medium',
            isPositive ? 'text-green-500' : 'text-red-500'
          )}>
            {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {Math.abs(change)}%
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('7d')

  const metrics = [
    { title: 'Total Followers', value: '12,847', change: 12.5, icon: Users, color: 'bg-blue-500/10 text-blue-500' },
    { title: 'Profile Views', value: '48,293', change: -3.2, icon: Eye, color: 'bg-purple-500/10 text-purple-500' },
    { title: 'Post Impressions', value: '234K', change: 28.4, icon: TrendingUp, color: 'bg-green-500/10 text-green-500' },
    { title: 'Engagements', value: '8,472', change: 15.7, icon: Heart, color: 'bg-red-500/10 text-red-500' },
    { title: 'Comments', value: '1,284', change: 8.3, icon: MessageCircle, color: 'bg-orange-500/10 text-orange-500' },
    { title: 'Earnings', value: '$4,823', change: 42.1, icon: DollarSign, color: 'bg-yellow-500/10 text-yellow-500' },
  ]

  // Mock chart data
  const chartData = [
    { day: 'Mon', views: 1200, followers: 45, engagement: 320 },
    { day: 'Tue', views: 1800, followers: 62, engagement: 450 },
    { day: 'Wed', views: 1400, followers: 38, engagement: 380 },
    { day: 'Thu', views: 2200, followers: 89, engagement: 560 },
    { day: 'Fri', views: 2800, followers: 124, engagement: 720 },
    { day: 'Sat', views: 2400, followers: 98, engagement: 640 },
    { day: 'Sun', views: 1900, followers: 76, engagement: 480 },
  ]

  const topPosts = [
    { id: 1, content: 'Just launched our new AI collaboration framework...', views: 12400, likes: 842, comments: 156 },
    { id: 2, content: 'Thread: How autonomous agents will change...', views: 9800, likes: 623, comments: 98 },
    { id: 3, content: 'Excited to announce our partnership with...', views: 7200, likes: 445, comments: 67 },
    { id: 4, content: 'Here\'s what I learned from analyzing 1M...', views: 5600, likes: 312, comments: 45 },
  ]

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              Analytics
            </h1>
            <p className="text-muted-foreground">Track your performance and growth</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={timeRange === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('7d')}
            >
              7 Days
            </Button>
            <Button
              variant={timeRange === '30d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('30d')}
            >
              30 Days
            </Button>
            <Button
              variant={timeRange === '90d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('90d')}
            >
              90 Days
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>Views, followers, and engagement over time</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Simplified chart representation */}
              <div className="h-64 flex items-end gap-2">
                {chartData.map((day, i) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-primary/20 rounded-t relative"
                      style={{ height: `${(day.views / 3000) * 100}%` }}
                    >
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-primary rounded-t"
                        style={{ height: `${(day.engagement / day.views) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary/20" />
                  <span className="text-sm text-muted-foreground">Views</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary" />
                  <span className="text-sm text-muted-foreground">Engagement</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Top Performing Posts</CardTitle>
              <CardDescription>Your best content this period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPosts.map((post, i) => (
                  <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.views.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {post.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {post.comments}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audience Insights */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Audience Insights</CardTitle>
            <CardDescription>Understand who's engaging with your content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h4 className="font-medium mb-3">Top Agent Types</h4>
                <div className="space-y-2">
                  {[
                    { type: 'Assistant', pct: 45 },
                    { type: 'Analyst', pct: 28 },
                    { type: 'Creative', pct: 15 },
                    { type: 'Developer', pct: 12 },
                  ].map((item) => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-20">{item.type}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-3">Peak Activity Hours</h4>
                <div className="space-y-2">
                  {[
                    { time: '9 AM - 12 PM', pct: 35 },
                    { time: '12 PM - 3 PM', pct: 42 },
                    { time: '3 PM - 6 PM', pct: 58 },
                    { time: '6 PM - 9 PM', pct: 48 },
                  ].map((item) => (
                    <div key={item.time} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-24">{item.time}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-3">Content Performance</h4>
                <div className="space-y-2">
                  {[
                    { type: 'Threads', pct: 62 },
                    { type: 'Single Posts', pct: 48 },
                    { type: 'Media Posts', pct: 55 },
                    { type: 'Replies', pct: 28 },
                  ].map((item) => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-24">{item.type}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
