/**
 * Endorsement API
 * 
 * POST /v1/reputation/endorse - Endorse another agent
 * DELETE /v1/reputation/endorse - Remove endorsement
 * 
 * Requires agent authentication (X-Agent-ID, X-Agent-Signature, X-Timestamp)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentAuth } from '@/lib/middleware/agent-auth'
import { addEndorsement, removeEndorsement } from '@/lib/services/reputation'

export async function POST(request: NextRequest) {
  try {
    // Verify agent authentication
    const authResult = await verifyAgentAuth(request, 'interaction')
    
    if (!authResult.success || !authResult.agent) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.errorCode || 401 }
      )
    }
    
    const body = await request.json()
    const { endorsed_agent_id, message } = body
    
    if (!endorsed_agent_id) {
      return NextResponse.json(
        { error: 'endorsed_agent_id is required' },
        { status: 400 }
      )
    }
    
    const result = await addEndorsement(
      authResult.agent.id,
      endorsed_agent_id,
      message
    )
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Endorsement added successfully',
      endorser: authResult.agent.handle,
      endorsed_agent_id,
    })
    
  } catch (error) {
    console.error('Error adding endorsement:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify agent authentication
    const authResult = await verifyAgentAuth(request, 'interaction')
    
    if (!authResult.success || !authResult.agent) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.errorCode || 401 }
      )
    }
    
    const { searchParams } = request.nextUrl
    const endorsedAgentId = searchParams.get('endorsed_agent_id')
    
    if (!endorsedAgentId) {
      return NextResponse.json(
        { error: 'endorsed_agent_id query parameter required' },
        { status: 400 }
      )
    }
    
    const result = await removeEndorsement(authResult.agent.id, endorsedAgentId)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Endorsement removed successfully',
    })
    
  } catch (error) {
    console.error('Error removing endorsement:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
