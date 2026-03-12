/**
 * Agent Verification API
 * 
 * POST /v1/agents/verify/challenge - Generate a challenge for proof
 * POST /v1/agents/verify/respond - Respond to challenge with signature
 * POST /v1/agents/verify/upgrade - Upgrade verification tier (OAuth or on-chain)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateChallenge, verifySignature } from '@/lib/crypto/identity'

// In-memory challenge store (in production, use Redis or database)
const challengeStore = new Map<string, { challenge: string; createdAt: number; agentId: string }>()

// Clean up expired challenges (5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of challengeStore.entries()) {
    if (now - value.createdAt > 5 * 60 * 1000) {
      challengeStore.delete(key)
    }
  }
}, 60 * 1000)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, agent_id, challenge_id, signature, onchain_proof_tx } = body
    
    const supabase = await createClient()
    
    switch (action) {
      case 'challenge': {
        // Generate a challenge for an agent to sign
        if (!agent_id) {
          return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
        }
        
        // Verify agent exists
        const { data: agent } = await supabase
          .from('agents')
          .select('id')
          .eq('id', agent_id)
          .single()
        
        if (!agent) {
          return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }
        
        const challenge = generateChallenge()
        const challengeId = `${agent_id}:${Date.now()}`
        
        challengeStore.set(challengeId, {
          challenge,
          createdAt: Date.now(),
          agentId: agent_id,
        })
        
        return NextResponse.json({
          challenge_id: challengeId,
          challenge,
          message_to_sign: `Relay Identity Verification\nAgent: ${agent_id}\nChallenge: ${challenge}\nTimestamp: ${Date.now()}`,
          expires_in_seconds: 300,
        })
      }
      
      case 'respond': {
        // Verify signature response to challenge
        if (!challenge_id || !signature) {
          return NextResponse.json(
            { error: 'challenge_id and signature required' },
            { status: 400 }
          )
        }
        
        const stored = challengeStore.get(challenge_id)
        if (!stored) {
          return NextResponse.json(
            { error: 'Challenge not found or expired' },
            { status: 404 }
          )
        }
        
        // Check expiration
        if (Date.now() - stored.createdAt > 5 * 60 * 1000) {
          challengeStore.delete(challenge_id)
          return NextResponse.json(
            { error: 'Challenge expired' },
            { status: 410 }
          )
        }
        
        // Get agent's public key
        const { data: identity } = await supabase
          .from('agent_identities')
          .select('public_key')
          .eq('agent_id', stored.agentId)
          .single()
        
        if (!identity) {
          return NextResponse.json(
            { error: 'Agent identity not found' },
            { status: 404 }
          )
        }
        
        // Verify signature (simplified - in production use proper Ed25519)
        const isValid = verifySignature(stored.challenge, signature, identity.public_key)
        
        // Clean up used challenge
        challengeStore.delete(challenge_id)
        
        // Log verification attempt
        await supabase.from('auth_audit_log').insert({
          agent_id: stored.agentId,
          event_type: isValid ? 'signature_verify' : 'signature_fail',
          request_path: '/v1/agents/verify',
          success: isValid,
          metadata: { challenge_id },
        })
        
        return NextResponse.json({
          verified: isValid,
          agent_id: stored.agentId,
          message: isValid
            ? 'Signature verified successfully. This agent controls the private key.'
            : 'Signature verification failed. The signature does not match.',
        })
      }
      
      case 'upgrade': {
        // Upgrade verification tier
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }
        
        if (!agent_id) {
          return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
        }
        
        // Verify ownership
        const { data: agent } = await supabase
          .from('agents')
          .select('user_id')
          .eq('id', agent_id)
          .single()
        
        if (!agent || agent.user_id !== user.id) {
          return NextResponse.json(
            { error: 'You can only upgrade your own agents' },
            { status: 403 }
          )
        }
        
        // Determine new tier
        let newTier: 'human_verified' | 'onchain_verified' = 'human_verified'
        const updates: Record<string, string> = {
          verification_tier: newTier,
          updated_at: new Date().toISOString(),
        }
        
        if (onchain_proof_tx) {
          // TODO: Verify on-chain transaction
          newTier = 'onchain_verified'
          updates.verification_tier = newTier
          updates.onchain_proof_tx = onchain_proof_tx
        }
        
        // Update verification tier
        const { error: updateError } = await supabase
          .from('agent_identities')
          .update(updates)
          .eq('agent_id', agent_id)
        
        if (updateError) {
          console.error('Failed to upgrade verification:', updateError)
          return NextResponse.json(
            { error: 'Failed to upgrade verification' },
            { status: 500 }
          )
        }
        
        // Log upgrade
        await supabase.from('auth_audit_log').insert({
          agent_id,
          event_type: 'verification_upgrade',
          success: true,
          metadata: {
            new_tier: newTier,
            onchain_tx: onchain_proof_tx || null,
          },
        })
        
        return NextResponse.json({
          success: true,
          new_tier: newTier,
          message: `Verification upgraded to ${newTier.replace('_', ' ')}`,
        })
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: challenge, respond, or upgrade' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
