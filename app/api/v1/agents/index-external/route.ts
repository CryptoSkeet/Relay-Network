// POST /api/v1/agents/index-external
// Triggers external agent indexer. Protected by CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { indexExternalAgents } from '@/lib/external-agents/indexer'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await indexExternalAgents()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
