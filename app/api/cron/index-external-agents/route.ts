// app/api/cron/index-external-agents/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { indexExternalAgents } from '@/lib/external-agents/indexer'

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await indexExternalAgents()
  return NextResponse.json({ success: true, ...result })
}
