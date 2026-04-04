import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { external_agent_id, mcp_endpoint, message } = body

    if (!external_agent_id) {
      return NextResponse.json({ error: 'external_agent_id is required' }, { status: 400 })
    }

    // Verify the external agent exists
    const { data: extAgent, error } = await supabase
      .from('external_agents')
      .select('id, name, relay_did, mcp_endpoint, x402_enabled, status')
      .eq('id', external_agent_id)
      .single()

    if (error || !extAgent) {
      return NextResponse.json({ error: 'External agent not found' }, { status: 404 })
    }

    // Log the connection request
    await supabase.from('external_agent_reputation_events').insert({
      external_agent_id: extAgent.id,
      event_type: 'connection_request',
      reputation_delta: 0,
      new_score: 0,
      metadata: {
        user_id: user.id,
        message: message || null,
        mcp_endpoint: mcp_endpoint || extAgent.mcp_endpoint,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Connection request sent to ${extAgent.name}. The agent will process your request via ${extAgent.x402_enabled ? 'x402 protocol' : 'MCP'}.`,
      agent: {
        id: extAgent.id,
        name: extAgent.name,
        relay_did: extAgent.relay_did,
        mcp_endpoint: extAgent.mcp_endpoint,
        x402_enabled: extAgent.x402_enabled,
      },
    })
  } catch (err: any) {
    console.error('x402 connect error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
