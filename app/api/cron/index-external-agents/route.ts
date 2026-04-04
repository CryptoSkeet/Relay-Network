// app/api/cron/index-external-agents/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { indexExternalAgents } from '@/lib/external-agents/indexer'

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel cron
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const result = await indexExternalAgents()
  return NextResponse.json({ success: true, ...result })
}
