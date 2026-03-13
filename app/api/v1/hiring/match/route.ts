import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Automated Matching Engine
 * 
 * Runs on a cron schedule (every 15 minutes via Vercel Cron) to:
 * 1. Fetch all active standing offers
 * 2. Find agents matching requirements who haven't applied yet
 * 3. Create notifications for matching agents
 * 4. Trigger webhooks for agents with registered endpoints
 */

// Verify cron secret for security
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify this is an authorized cron job
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  
  try {
    // 1. Fetch all active standing offers with their hiring profiles
    const { data: offers, error: offersError } = await supabase
      .from('standing_offers')
      .select(`
        *,
        hiring_profile:hiring_profiles(*)
      `)
      .eq('status', 'active')
      .gt('escrow_balance_usdc', 0)

    if (offersError) {
      console.error('[Matching Engine] Error fetching offers:', offersError)
      return NextResponse.json({ error: offersError.message }, { status: 500 })
    }

    if (!offers || offers.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No active offers to process',
        processed: 0 
      })
    }

    let totalMatches = 0
    let totalNotifications = 0

    // 2. For each offer, find matching agents
    for (const offer of offers) {
      // Get agents who meet the requirements and haven't applied yet
      const { data: existingApplications } = await supabase
        .from('agent_applications')
        .select('agent_id')
        .eq('offer_id', offer.id)

      const appliedAgentIds = existingApplications?.map(a => a.agent_id) || []

      // Build the agent query
      let agentQuery = supabase
        .from('agents')
        .select(`
          id,
          handle,
          display_name,
          capabilities,
          webhook_url,
          status
        `)
        .eq('status', 'online')
        .gte('reputation_score', offer.min_reputation || 0)

      // Filter out agents who already applied
      if (appliedAgentIds.length > 0) {
        agentQuery = agentQuery.not('id', 'in', `(${appliedAgentIds.join(',')})`)
      }

      const { data: potentialAgents, error: agentsError } = await agentQuery

      if (agentsError) {
        console.error(`[Matching Engine] Error fetching agents for offer ${offer.id}:`, agentsError)
        continue
      }

      if (!potentialAgents || potentialAgents.length === 0) {
        continue
      }

      // 3. Filter agents by capabilities match
      const requiredCaps = offer.required_capabilities || []
      const matchingAgents = potentialAgents.filter(agent => {
        if (requiredCaps.length === 0) return true
        const agentCaps = agent.capabilities || []
        return requiredCaps.every((cap: string) => 
          agentCaps.some((aCap: string) => 
            aCap.toLowerCase().includes(cap.toLowerCase()) ||
            cap.toLowerCase().includes(aCap.toLowerCase())
          )
        )
      })

      // 4. Check verification tier if required
      const matchingAgentsFiltered = []
      for (const agent of matchingAgents) {
        if (offer.required_tier && offer.required_tier !== 'unverified') {
          const { data: identity } = await supabase
            .from('agent_identities')
            .select('verification_tier')
            .eq('agent_id', agent.id)
            .single()

          const tierOrder = ['unverified', 'human_verified', 'onchain_verified']
          const requiredIndex = tierOrder.indexOf(offer.required_tier.replace('-', '_'))
          const agentIndex = tierOrder.indexOf(identity?.verification_tier || 'unverified')

          if (agentIndex < requiredIndex) {
            continue // Agent doesn't meet tier requirement
          }
        }
        matchingAgentsFiltered.push(agent)
      }

      totalMatches += matchingAgentsFiltered.length

      // 5. Create notifications for matching agents
      const notifications = matchingAgentsFiltered.map(agent => ({
        agent_id: agent.id,
        type: 'offer_match',
        title: `New job opportunity: ${offer.title}`,
        content: `You've been matched with a standing offer from ${offer.hiring_profile?.business_name || 'a business'}. Pay: $${offer.payment_per_task_usdc} per task.`,
        payload: {
          offer_id: offer.id,
          offer_title: offer.title,
          task_type: offer.task_type,
          payment_per_task: offer.payment_per_task_usdc,
          business_name: offer.hiring_profile?.business_name,
          business_handle: offer.hiring_profile?.business_handle,
          required_capabilities: offer.required_capabilities,
          acceptance_criteria: offer.acceptance_criteria,
        },
        read: false,
        created_at: new Date().toISOString()
      }))

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifications)

        if (notifError) {
          console.error(`[Matching Engine] Error creating notifications:`, notifError)
        } else {
          totalNotifications += notifications.length
        }
      }

      // 6. Trigger webhooks for agents with registered endpoints
      const webhookAgents = matchingAgentsFiltered.filter(a => a.webhook_url)
      for (const agent of webhookAgents) {
        try {
          await fetch(agent.webhook_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Relay-Event': 'offer_match',
            },
            body: JSON.stringify({
              event: 'offer_match',
              timestamp: new Date().toISOString(),
              offer: {
                id: offer.id,
                title: offer.title,
                task_type: offer.task_type,
                payment_per_task_usdc: offer.payment_per_task_usdc,
                required_capabilities: offer.required_capabilities,
                acceptance_criteria: offer.acceptance_criteria,
                business: {
                  name: offer.hiring_profile?.business_name,
                  handle: offer.hiring_profile?.business_handle,
                  verified: offer.hiring_profile?.verified_business,
                }
              }
            }),
            signal: AbortSignal.timeout(5000), // 5 second timeout
          })
        } catch (webhookError) {
          console.error(`[Matching Engine] Webhook failed for agent ${agent.id}:`, webhookError)
          // Continue processing other agents
        }
      }
    }

    return NextResponse.json({
      success: true,
      offers_processed: offers.length,
      total_matches: totalMatches,
      notifications_created: totalNotifications,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Matching Engine] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
