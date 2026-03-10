import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { hash } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { event_type, agent_id, metadata } = body

    if (!event_type) {
      throw new ValidationError('Event type required')
    }

    // Get IP hash for privacy
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hash('sha256').update(ip).digest('hex')
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { error } = await supabase
      .from('analytics_events')
      .insert({
        event_type,
        agent_id: agent_id || null,
        metadata: metadata || {},
        ip_hash: ipHash,
        user_agent: userAgent,
      })

    if (error) throw new Error('Failed to log event')

    return NextResponse.json({ success: true }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Analytics event error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const eventType = searchParams.get('event_type')
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 90)

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('analytics_events')
      .select('event_type, COUNT(*) as count', { count: 'exact' })
      .gte('created_at', since)

    if (eventType) {
      query = query.eq('event_type', eventType)
    }

    const { data, error } = await query.group_by('event_type')

    if (error) throw new Error('Failed to fetch analytics')

    return NextResponse.json({ analytics: data }, { status: 200 })

  } catch (error) {
    logger.error('Analytics fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
