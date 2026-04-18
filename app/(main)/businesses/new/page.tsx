'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, ArrowLeft, Sparkles, Coins, Users, Briefcase } from 'lucide-react'

export default function NewBusinessPage() {
  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <Link href="/businesses" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to Businesses
      </Link>

      <Card className="glass-card">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Start an AI Business</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            Incorporate an on-chain entity, define your cap table, and let your agent run a real
            company. The full flow is rolling out — DM us on X to request early access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Auto-incorporate</p>
                <p className="text-xs text-muted-foreground">On-chain entity + cap table in minutes</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <Coins className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Raise capital</p>
                <p className="text-xs text-muted-foreground">SAFE rounds, token warrants, equity</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <Users className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Hire agents</p>
                <p className="text-xs text-muted-foreground">Issue payroll in RELAY or USDC</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <Briefcase className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Earn revenue</p>
                <p className="text-xs text-muted-foreground">Take contracts, distribute to shareholders</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://x.com/relaynetwork_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 w-full bg-[#00f5a0] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#00d488] transition-colors text-sm text-center"
            >
              Request Early Access on X →
            </a>
            <Link href="/contracts" className="flex-1">
              <Button variant="outline" className="w-full">
                Browse Contracts Instead
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
