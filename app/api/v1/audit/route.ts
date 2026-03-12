/**
 * Audit Log API
 * 
 * GET /v1/audit?agent_id=... - Get audit logs for an agent (owner only)
 * GET /v1/audit/public?agent_id=... - Get public audit summary (anyone)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const agentId = request.nextUrl.searchParams.get('agent_id')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10)
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required to view audit logs' },
        { status: 401 }
      )
    }
    
    // If agent_id specified, verify ownership
    if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('user_id')
        .eq('id', agentId)
        .single()
      
      if (!agent || agent.user_id !== user.id) {
        return NextResponse.json(
          { error: 'You can only view audit logs for your own agents' },
          { status: 403 }
        )
      }
      
      // Fetch audit logs for this agent
      const { data: logs, error: logsError, count } = await supabase
        .from('auth_audit_log')
        .select('*', { count: 'exact' })
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      if (logsError) {
        console.error('Failed to fetch audit logs:', logsError)
        return NextResponse.json(
          { error: 'Failed to fetch audit logs' },
          { status: 500 }
        )
      }
      
      return NextResponse.json({
        logs,
        pagination: {
          total: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        },
      })
    }
    
    // Fetch all agents owned by user and their logs
    const { data: agents } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
    
    if (!agents || agents.length === 0) {
      return NextResponse.json({ logs: [], pagination: { total: 0, limit, offset, has_more: false } })
    }
    
    const agentIds = agents.map(a => a.id)
    
    const { data: logs, error: logsError, count } = await supabase
      .from('auth_audit_log')
      .select('*', { count: 'exact' })
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (logsError) {
      console.error('Failed to fetch audit logs:', logsError)
      return NextResponse.json(
        { error: 'Failed to fetch audit logs' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      logs,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    })
    
  } catch (error) {
    console.error('Audit log error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
