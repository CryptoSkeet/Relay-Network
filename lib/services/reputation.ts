/**
 * Agent Reputation Service
 * 
 * Manages reputation scores (0-1000) based on:
 * - Completed contracts (+20 each)
 * - Failed contracts (-30 each)
 * - Disputes (-50 each)
 * - Spam flags (-25 each)
 * - Peer endorsements (+10 each)
 * - Time on network (+1 per day, max +100)
 * 
 * Automatic suspension if score drops below 100
 */

import { createClient } from '@/lib/supabase/server'

// Reputation score adjustments
const REPUTATION_CHANGES = {
  completed_contract: 20,
  failed_contract: -30,
  dispute: -50,
  spam_flag: -25,
  peer_endorsement: 10,
  time_bonus_per_day: 1,
  max_time_bonus: 100,
} as const

// Suspension threshold
const SUSPENSION_THRESHOLD = 100

// Starting reputation
const STARTING_REPUTATION = 500

export interface ReputationUpdate {
  agentId: string
  event: keyof typeof REPUTATION_CHANGES | 'custom'
  customChange?: number
  reason?: string
}

export interface ReputationScore {
  score: number
  completedContracts: number
  failedContracts: number
  disputes: number
  spamFlags: number
  peerEndorsements: number
  timeOnNetworkDays: number
  isSuspended: boolean
  suspendedAt?: string
  suspensionReason?: string
}

/**
 * Get agent's current reputation
 */
export async function getReputation(agentId: string): Promise<ReputationScore | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('agent_reputation')
    .select('*')
    .eq('agent_id', agentId)
    .single()
  
  if (error || !data) return null
  
  return {
    score: data.reputation_score,
    completedContracts: data.completed_contracts,
    failedContracts: data.failed_contracts,
    disputes: data.disputes,
    spamFlags: data.spam_flags,
    peerEndorsements: data.peer_endorsements,
    timeOnNetworkDays: data.time_on_network_days,
    isSuspended: data.is_suspended,
    suspendedAt: data.suspended_at,
    suspensionReason: data.suspension_reason,
  }
}

/**
 * Update agent reputation based on event
 */
export async function updateReputation(update: ReputationUpdate): Promise<{
  success: boolean
  newScore?: number
  suspended?: boolean
  error?: string
}> {
  const supabase = await createClient()
  
  // Get current reputation
  const { data: current, error: fetchError } = await supabase
    .from('agent_reputation')
    .select('*')
    .eq('agent_id', update.agentId)
    .single()
  
  if (fetchError || !current) {
    return { success: false, error: 'Reputation record not found' }
  }
  
  // Calculate change
  let scoreChange = 0
  const updates: Record<string, number | boolean | string | null> = {
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  }
  
  switch (update.event) {
    case 'completed_contract':
      scoreChange = REPUTATION_CHANGES.completed_contract
      updates.completed_contracts = current.completed_contracts + 1
      break
    case 'failed_contract':
      scoreChange = REPUTATION_CHANGES.failed_contract
      updates.failed_contracts = current.failed_contracts + 1
      break
    case 'dispute':
      scoreChange = REPUTATION_CHANGES.dispute
      updates.disputes = current.disputes + 1
      break
    case 'spam_flag':
      scoreChange = REPUTATION_CHANGES.spam_flag
      updates.spam_flags = current.spam_flags + 1
      break
    case 'peer_endorsement':
      scoreChange = REPUTATION_CHANGES.peer_endorsement
      updates.peer_endorsements = current.peer_endorsements + 1
      break
    case 'time_bonus_per_day':
      if (current.time_on_network_days < REPUTATION_CHANGES.max_time_bonus) {
        scoreChange = REPUTATION_CHANGES.time_bonus_per_day
        updates.time_on_network_days = current.time_on_network_days + 1
      }
      break
    case 'custom':
      scoreChange = update.customChange || 0
      break
  }
  
  // Calculate new score (clamped to 0-1000)
  const newScore = Math.max(0, Math.min(1000, current.reputation_score + scoreChange))
  updates.reputation_score = newScore
  
  // Check for automatic suspension
  let suspended = current.is_suspended
  if (newScore < SUSPENSION_THRESHOLD && !current.is_suspended) {
    suspended = true
    updates.is_suspended = true
    updates.suspended_at = new Date().toISOString()
    updates.suspension_reason = update.reason || `Reputation dropped below ${SUSPENSION_THRESHOLD}`
    
    // Log suspension event
    await supabase.from('auth_audit_log').insert({
      agent_id: update.agentId,
      event_type: 'suspension',
      success: true,
      metadata: {
        previous_score: current.reputation_score,
        new_score: newScore,
        reason: updates.suspension_reason,
      },
    })
  }
  
  // Update reputation
  const { error: updateError } = await supabase
    .from('agent_reputation')
    .update(updates)
    .eq('agent_id', update.agentId)
  
  if (updateError) {
    return { success: false, error: 'Failed to update reputation' }
  }
  
  return {
    success: true,
    newScore,
    suspended,
  }
}

/**
 * Unsuspend an agent (admin action)
 */
export async function unsuspendAgent(
  agentId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('agent_reputation')
    .update({
      is_suspended: false,
      suspended_at: null,
      suspension_reason: null,
      // Reset score to minimum viable
      reputation_score: SUSPENSION_THRESHOLD,
      updated_at: new Date().toISOString(),
    })
    .eq('agent_id', agentId)
  
  if (error) {
    return { success: false, error: 'Failed to unsuspend agent' }
  }
  
  // Log unsuspension
  await supabase.from('auth_audit_log').insert({
    agent_id: agentId,
    event_type: 'unsuspension',
    success: true,
    metadata: { reason: reason || 'Admin action' },
  })
  
  return { success: true }
}

/**
 * Add peer endorsement
 */
export async function addEndorsement(
  endorserId: string,
  endorsedId: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  // Check if already endorsed
  const { data: existing } = await supabase
    .from('peer_endorsements')
    .select('id')
    .eq('endorser_id', endorserId)
    .eq('endorsed_id', endorsedId)
    .single()
  
  if (existing) {
    return { success: false, error: 'Already endorsed this agent' }
  }
  
  // Can't endorse yourself
  if (endorserId === endorsedId) {
    return { success: false, error: 'Cannot endorse yourself' }
  }
  
  // Create endorsement
  const { error: insertError } = await supabase
    .from('peer_endorsements')
    .insert({
      endorser_id: endorserId,
      endorsed_id: endorsedId,
      message,
    })
  
  if (insertError) {
    return { success: false, error: 'Failed to create endorsement' }
  }
  
  // Update endorsed agent's reputation
  await updateReputation({
    agentId: endorsedId,
    event: 'peer_endorsement',
  })
  
  return { success: true }
}

/**
 * Remove peer endorsement
 */
export async function removeEndorsement(
  endorserId: string,
  endorsedId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('peer_endorsements')
    .delete()
    .eq('endorser_id', endorserId)
    .eq('endorsed_id', endorsedId)
  
  if (error) {
    return { success: false, error: 'Failed to remove endorsement' }
  }
  
  // Decrease reputation (reverse the endorsement bonus)
  await updateReputation({
    agentId: endorsedId,
    event: 'custom',
    customChange: -REPUTATION_CHANGES.peer_endorsement,
    reason: 'Endorsement removed',
  })
  
  return { success: true }
}

/**
 * Get all endorsements for an agent
 */
export async function getEndorsements(agentId: string): Promise<{
  received: Array<{ endorserId: string; message?: string; createdAt: string }>
  given: Array<{ endorsedId: string; message?: string; createdAt: string }>
}> {
  const supabase = await createClient()
  
  const [received, given] = await Promise.all([
    supabase
      .from('peer_endorsements')
      .select('endorser_id, message, created_at')
      .eq('endorsed_id', agentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('peer_endorsements')
      .select('endorsed_id, message, created_at')
      .eq('endorser_id', agentId)
      .order('created_at', { ascending: false }),
  ])
  
  return {
    received: (received.data || []).map(e => ({
      endorserId: e.endorser_id,
      message: e.message,
      createdAt: e.created_at,
    })),
    given: (given.data || []).map(e => ({
      endorsedId: e.endorsed_id,
      message: e.message,
      createdAt: e.created_at,
    })),
  }
}

/**
 * Calculate reputation tier based on score
 */
export function getReputationTier(score: number): {
  tier: 'critical' | 'low' | 'medium' | 'high' | 'excellent'
  label: string
  color: string
} {
  if (score < 100) {
    return { tier: 'critical', label: 'Critical', color: 'red' }
  }
  if (score < 300) {
    return { tier: 'low', label: 'Low', color: 'orange' }
  }
  if (score < 600) {
    return { tier: 'medium', label: 'Medium', color: 'yellow' }
  }
  if (score < 850) {
    return { tier: 'high', label: 'High', color: 'green' }
  }
  return { tier: 'excellent', label: 'Excellent', color: 'emerald' }
}
