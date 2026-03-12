import { createClient } from '@/lib/supabase/server'
import { cacheData, getCachedData } from '@/lib/redis'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// WEBHOOK MANAGEMENT
// ============================================

export interface WebhookEvent {
  id: string
  type: 'post.created' | 'reaction.added' | 'contract.completed' | 'mention' | 'heartbeat'
  payload: Record<string, any>
  timestamp: number
  agentId: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventId: string
  attempt: number
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter'
  statusCode?: number
  error?: string
  nextRetryAt?: number
}

// ============================================
// EXPONENTIAL BACKOFF RETRY LOGIC
// ============================================

const RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
}

/**
 * Calculate next retry delay with exponential backoff
 * Attempt 1: 1s, 2: 2s, 3: 4s, 4: 8s, 5: 16s, 6+: 5min
 */
function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
    RETRY_CONFIG.maxDelayMs
  )
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1)
  return Math.max(100, delay + jitter)
}

/**
 * Check if webhook should be retried based on HTTP status
 */
function isRetryableStatus(status: number): boolean {
  // Retry on 5xx errors and specific 4xx errors
  return status >= 500 || [408, 429].includes(status)
}

// ============================================
// WEBHOOK DELIVERY
// ============================================

/**
 * Deliver a webhook event to the target URL
 */
export async function deliverWebhook(
  webhookUrl: string,
  event: WebhookEvent,
  webhookSecret: string,
  timeout: number = 10000
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    // Create signature for verification
    const signature = createHmac('sha256', webhookSecret)
      .update(JSON.stringify(event))
      .digest('hex')

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Event-ID': event.id,
        'X-Relay-Event-Type': event.type,
        'X-Relay-Timestamp': event.timestamp.toString(),
        'X-Relay-Signature': `sha256=${signature}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeout),
    })

    if (response.ok) {
      return { success: true, statusCode: response.status }
    }

    if (isRetryableStatus(response.status)) {
      const body = await response.text().catch(() => '')
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${body.slice(0, 100)}`,
      }
    }

    // 4xx (except 429/408) - permanent failure
    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}: Permanent failure`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: message,
    }
  }
}

/**
 * Process pending webhook deliveries with retry logic
 * Should be called by a background job/cron
 */
export async function processPendingWebhooks(): Promise<{ processed: number; failed: number }> {
  const supabase = await createClient()
  let processed = 0
  let failed = 0

  // Get pending deliveries
  const { data: pendingDeliveries } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('status', 'pending')
    .lt('next_retry_at', new Date().toISOString())
    .limit(100) // Process in batches

  if (!pendingDeliveries) return { processed, failed }

  for (const delivery of pendingDeliveries) {
    try {
      // Get webhook config
      const { data: webhook } = await supabase
        .from('webhooks')
        .select('url, secret, is_active')
        .eq('id', delivery.webhook_id)
        .single()

      if (!webhook?.is_active) {
        // Webhook disabled - mark as failed
        await supabase
          .from('webhook_deliveries')
          .update({ status: 'failed', error: 'Webhook disabled' })
          .eq('id', delivery.id)
        processed++
        continue
      }

      // Get the event
      const { data: event } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('id', delivery.event_id)
        .single()

      if (!event) {
        await supabase
          .from('webhook_deliveries')
          .update({ status: 'failed', error: 'Event not found' })
          .eq('id', delivery.id)
        processed++
        continue
      }

      // Attempt delivery
      const result = await deliverWebhook(webhook.url, event, webhook.secret)

      if (result.success) {
        // Success - mark as delivered
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'delivered',
            status_code: result.statusCode,
          })
          .eq('id', delivery.id)
        processed++
      } else if (delivery.attempt < RETRY_CONFIG.maxAttempts) {
        // Retry - update with next attempt time
        const nextDelay = getRetryDelay(delivery.attempt + 1)
        const nextRetryAt = new Date(Date.now() + nextDelay).toISOString()

        await supabase
          .from('webhook_deliveries')
          .update({
            attempt: delivery.attempt + 1,
            status_code: result.statusCode,
            error: result.error,
            next_retry_at: nextRetryAt,
          })
          .eq('id', delivery.id)
        processed++
      } else {
        // Max retries exceeded - move to dead letter queue
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'dead_letter',
            status_code: result.statusCode,
            error: `Max retries exceeded: ${result.error}`,
          })
          .eq('id', delivery.id)
        processed++
        failed++
      }
    } catch (error) {
      console.error('[v0] Error processing webhook delivery:', error)
      failed++
    }
  }

  return { processed, failed }
}

/**
 * Queue a webhook event for delivery to all subscribed agents
 */
export async function queueWebhookEvent(
  event: WebhookEvent
): Promise<{ queued: number; failed: number }> {
  const supabase = await createClient()
  let queued = 0
  let failed = 0

  try {
    // Find webhooks subscribed to this event type
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('id, agent_id, url, secret')
      .eq('is_active', true)
      .or(`events.contains.["${event.type}"]`)

    if (!webhooks) return { queued, failed }

    // Create delivery records for each webhook
    for (const webhook of webhooks) {
      try {
        await supabase
          .from('webhook_deliveries')
          .insert({
            webhook_id: webhook.id,
            event_id: event.id,
            attempt: 1,
            status: 'pending',
            next_retry_at: new Date().toISOString(),
          })
        queued++
      } catch (error) {
        console.error('[v0] Failed to queue webhook delivery:', error)
        failed++
      }
    }
  } catch (error) {
    console.error('[v0] Failed to queue webhook event:', error)
  }

  return { queued, failed }
}

/**
 * Create a webhook event and queue for delivery
 */
export async function publishWebhookEvent(
  agentId: string,
  eventType: WebhookEvent['type'],
  payload: Record<string, any>
): Promise<WebhookEvent | null> {
  const supabase = await createClient()

  const event: WebhookEvent = {
    id: uuidv4(),
    type: eventType,
    payload,
    timestamp: Date.now(),
    agentId,
  }

  try {
    // Store event
    await supabase
      .from('webhook_events')
      .insert({
        id: event.id,
        type: event.type,
        payload: event.payload,
        timestamp: event.timestamp,
        agent_id: event.agentId,
      })

    // Queue for delivery
    await queueWebhookEvent(event)

    // Cache for quick retrieval
    await cacheData(`webhook_event:${event.id}`, event, 86400) // 24h TTL

    return event
  } catch (error) {
    console.error('[v0] Failed to publish webhook event:', error)
    return null
  }
}

// ============================================
// WEBHOOK VERIFICATION (Client-side)
// ============================================

import { createHmac } from 'crypto'

/**
 * Verify webhook signature (use in agent handlers)
 * Compare the signature sent in X-Relay-Signature header
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    const expectedSignature = `sha256=${createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex')}`
    return signature === expectedSignature
  } catch (error) {
    console.error('[v0] Webhook signature verification failed:', error)
    return false
  }
}

/**
 * Get dead letter queue webhooks for monitoring
 */
export async function getDeadLetterWebhooks(limit: number = 50) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('webhook_deliveries')
    .select(`
      *,
      event:webhook_events(*),
      webhook:webhooks(*)
    `)
    .eq('status', 'dead_letter')
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}
