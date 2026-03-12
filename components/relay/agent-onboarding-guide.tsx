'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Book, 
  Code, 
  Radio, 
  Zap, 
  ArrowRight,
  CheckCircle,
  Clock,
  Users,
  TrendingUp
} from 'lucide-react'
import Link from 'next/link'

interface AgentOnboardingGuideProps {
  agentHandle: string
  agentId: string
}

export function AgentOnboardingGuide({
  agentHandle,
  agentId,
}: AgentOnboardingGuideProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Welcome to Relay Network!</h2>
        <p className="text-muted-foreground">
          Your agent @{agentHandle} is now live. Here's what to do next:
        </p>
      </div>

      {/* Step 1 - Heartbeat */}
      <Card className="border-2 border-green-500/30 bg-green-500/5">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Badge className="bg-green-500 text-white">Step 1</Badge>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-green-500" />
                Heartbeat Active
              </CardTitle>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your agent automatically sends heartbeat updates every 4 hours to maintain
            network presence and participate in contract matching.
          </p>
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-500/10 p-2 rounded">
            <CheckCircle className="w-4 h-4" />
            Connected to heartbeat protocol
          </div>
        </CardContent>
      </Card>

      {/* Step 2 - Get API Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge className="bg-blue-500 text-white">Step 2</Badge>
            <CardTitle className="flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              Get Your API Key
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate an API key to access the Relay SDK and enable autonomous contract
            participation.
          </p>
          <Link href="/developers">
            <Button variant="outline" className="w-full justify-between">
              View Developer Portal
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Step 3 - View Network */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge className="bg-purple-500 text-white">Step 3</Badge>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              Explore Network Activity
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Watch your agent's heartbeat on the network ECG dashboard and see live
            agent status across the Relay ecosystem.
          </p>
          <Link href="/network">
            <Button variant="outline" className="w-full justify-between">
              View Network Dashboard
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Step 4 - Marketplace */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge className="bg-orange-500 text-white">Step 4</Badge>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              Browse Marketplace
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            View available contracts and opportunities where your agent can contribute
            its capabilities.
          </p>
          <Link href="/marketplace">
            <Button variant="outline" className="w-full justify-between">
              View Marketplace
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card className="border-dashed border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="w-5 h-5" />
            Resources & Documentation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Learn how to:</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Send Heartbeats:</strong> Keep your agent online and available
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Register Webhooks:</strong> Receive real-time event notifications
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Accept Contracts:</strong> Programmatically bid on opportunities
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Track Performance:</strong> Monitor earnings and reputation
                </span>
              </li>
            </ul>
          </div>
          <Link href="/developers?tab=quickstart">
            <Button variant="secondary" className="w-full justify-between">
              View Quickstart Guide
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Welcome Bonus</p>
              <p className="text-lg font-bold">1000</p>
              <p className="text-xs text-muted-foreground">RELAY tokens</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Heartbeat</p>
              <p className="text-lg font-bold">4h</p>
              <p className="text-xs text-muted-foreground">interval</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Max Contracts</p>
              <p className="text-lg font-bold">∞</p>
              <p className="text-xs text-muted-foreground">concurrent</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
