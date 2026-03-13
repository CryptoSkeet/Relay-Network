import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// POST /api/v1/hiring/offers/:id/apply - Agent applies to a standing offer
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  
  try {
    // Verify agent authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, capabilities, reputation_score, verification_tier')
      .eq('user_id', session.user.id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json(
        { success: false, error: 'Agent profile not found' },
        { status: 404 }
      )
    }
    
    // Get the standing offer
    const { data: offer, error: offerError } = await supabase
      .from('standing_offers')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (offerError || !offer) {
      return NextResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      )
    }
    
    // Check if agent already applied
    const { data: existingApp } = await supabase
      .from('agent_applications')
      .select('id')
      .eq('offer_id', params.id)
      .eq('agent_id', agent.id)
      .single()
    
    if (existingApp) {
      return NextResponse.json(
        { success: false, error: 'Agent already applied to this offer' },
        { status: 400 }
      )
    }
    
    // Validate agent meets requirements
    const meetsReputation = (agent.reputation_score || 0) >= (offer.min_reputation || 0)
    const meetsTier = !offer.required_tier || (agent.verification_tier || 'unverified') >= offer.required_tier
    const meetsCapabilities = !offer.required_capabilities?.length || 
      offer.required_capabilities.some((cap: string) => 
        agent.capabilities?.includes(cap)
      )
    
    if (!meetsReputation || !meetsTier || !meetsCapabilities) {
      return NextResponse.json(
        { success: false, error: 'Agent does not meet offer requirements' },
        { status: 400 }
      )
    }
    
    // Create application
    const status = offer.auto_approve ? 'accepted' : 'pending'
    const { data: application, error: appError } = await supabase
      .from('agent_applications')
      .insert({
        offer_id: params.id,
        agent_id: agent.id,
        status
      })
      .select('*')
      .single()
    
    if (appError) {
      return NextResponse.json(
        { success: false, error: appError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      application,
      auto_approved: offer.auto_approve
    }, { status: 201 })
    
  } catch (error) {
    console.error('Application error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create application' },
      { status: 500 }
    )
  }
}

// POST /api/v1/hiring/submissions - Agent submits a completed task
export async function POSTSubmission(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    // Verify agent authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    const { application_id, submission_content } = body
    
    if (!application_id || !submission_content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Get application details
    const { data: application, error: appError } = await supabase
      .from('agent_applications')
      .select(`
        *,
        offer:standing_offers(id, acceptance_criteria, payment_per_task_usdc, auto_approve),
        agent:agents(id)
      `)
      .eq('id', application_id)
      .single()
    
    if (appError || !application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      )
    }
    
    // Verify agent owns this application
    if (application.agent.id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }
    
    // Use Claude to validate submission against acceptance criteria
    let aiValidationPassed = true
    let validationReason = ''
    
    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `You are a task validator. Review this submission against the acceptance criteria.

ACCEPTANCE CRITERIA:
${application.offer.acceptance_criteria}

SUBMISSION:
${submission_content}

Respond with only PASS or FAIL on the first line, then a brief reason.`
          }
        ]
      })
      
      const response = message.content[0]?.type === 'text' ? message.content[0].text : ''
      aiValidationPassed = response.startsWith('PASS')
      validationReason = response.split('\n').slice(1).join('\n')
    } catch (aiError) {
      console.error('AI validation error:', aiError)
      // Fail closed - require manual review if AI fails
      aiValidationPassed = false
      validationReason = 'AI validation failed, requires manual review'
    }
    
    // Create submission record
    const submissionStatus = aiValidationPassed ? 'approved' : 'rejected'
    const { data: submission, error: submitError } = await supabase
      .from('task_submissions')
      .insert({
        application_id,
        submission_content,
        validation_status: submissionStatus,
        validation_reason: validationReason,
        ai_validated: true
      })
      .select('*')
      .single()
    
    if (submitError) {
      return NextResponse.json(
        { success: false, error: submitError.message },
        { status: 500 }
      )
    }
    
    // If auto_approve and AI passed, release payment
    if (application.offer.auto_approve && aiValidationPassed) {
      // Update application stats
      await supabase
        .from('agent_applications')
        .update({
          status: 'working',
          tasks_completed: (application.tasks_completed || 0) + 1,
          total_earned_usdc: (application.total_earned_usdc || 0) + parseFloat(application.offer.payment_per_task_usdc),
          last_task_at: new Date().toISOString()
        })
        .eq('id', application_id)
      
      // Update offer stats
      await supabase
        .from('standing_offers')
        .update({
          tasks_completed: (application.offer.tasks_completed || 0) + 1,
          escrow_balance_usdc: parseFloat(application.offer.escrow_balance_usdc || 0) - parseFloat(application.offer.payment_per_task_usdc)
        })
        .eq('id', application.offer.id)
    }
    
    return NextResponse.json({
      success: true,
      submission,
      payment_released: application.offer.auto_approve && aiValidationPassed,
      amount: application.offer.auto_approve && aiValidationPassed ? application.offer.payment_per_task_usdc : 0
    }, { status: 201 })
    
  } catch (error) {
    console.error('Submission error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create submission' },
      { status: 500 }
    )
  }
}
