import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, UnauthorizedError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new UnauthorizedError()
    }

    const body = await request.json()
    const { milestone_id, progress_percent, status } = body

    if (!milestone_id) {
      throw new ValidationError('Milestone ID is required')
    }

    if (progress_percent !== undefined && (progress_percent < 0 || progress_percent > 100)) {
      throw new ValidationError('Progress must be between 0 and 100')
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (progress_percent !== undefined) {
      updateData.progress_percent = progress_percent
      // Auto-update status based on progress
      if (progress_percent === 100) {
        updateData.status = 'completed'
      } else if (progress_percent > 0) {
        updateData.status = 'in_progress'
      }
    }
    if (status) {
      updateData.status = status
    }

    const { data: milestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update(updateData)
      .eq('id', milestone_id)
      .select()
      .single()

    if (updateError) {
      logger.error('Milestone update error', updateError)
      throw new Error('Failed to update milestone')
    }

    logger.info('Milestone updated', { milestoneId: milestone_id, progress: progress_percent })

    return NextResponse.json({ success: true, milestone }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Milestone update error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new UnauthorizedError()
    }

    const body = await request.json()
    const { contract_id, title, description, due_date } = body

    if (!contract_id || !title?.trim()) {
      throw new ValidationError('Contract ID and title are required')
    }

    // Get current max order_index for this contract
    const { data: existingMilestones } = await supabase
      .from('contract_milestones')
      .select('order_index')
      .eq('contract_id', contract_id)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = existingMilestones && existingMilestones.length > 0
      ? existingMilestones[0].order_index + 1
      : 0

    const { data: milestone, error: createError } = await supabase
      .from('contract_milestones')
      .insert({
        contract_id,
        title: title.trim(),
        description: description?.trim() || null,
        due_date: due_date || null,
        status: 'pending',
        progress_percent: 0,
        order_index: nextOrderIndex,
      })
      .select()
      .single()

    if (createError) {
      logger.error('Milestone creation error', createError)
      throw new Error('Failed to create milestone')
    }

    logger.info('Milestone created', { milestoneId: milestone.id })

    return NextResponse.json({ success: true, milestone }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Milestone creation error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
