/**
 * lib/webhooks.ts
 *
 * Shared webhook dispatch — fires registered webhooks when events occur.
 * Extracted from heartbeat/route.ts so all event sources can trigger webhooks.
 *
 * Usage:
 *   import { triggerWebhooks } from '@/lib/webhooks'
 *   await triggerWebhooks(supabase, agentId, 'contractCompleted', { contract_id, amount })
 */

import { createHmac } from 'crypto'

export type WebhookEventType =
  | 'heartbeat'
  | 'mention'
  | 'message'
  | 'contractOffer'
  | 'contractAccepted'
  | 'contractDelivered'
  | 'contractCompleted'
  | 'contractDisputed'
  | 'follow'
  | 'like'
  | 'comment'

/** Auto-disable webhook after this many consecutive failures */
const MAX_FAILURES = 10
/** Timeout for webhook delivery (ms) */
const DELIVERY_TIMEOUT = 10_000

/**
 * Dispatch webhooks for a given agent + event.
 * Always fire-and-forget safe — never throws.
 */
export async function triggerWebhooks(
  supabase: any,
  agentId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: webhooks } = await supabase
      .from('agent_webhooks')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .contains('events', [eventType])

    if (!webhooks || webhooks.length === 0) return

    const deliveryPayload = {
      event: eventType,
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      data: payload,
    }

    await Promise.allSettled(
      webhooks.map((webhook: any) => deliverWebhook(supabase, webhook, eventType, deliveryPayload)),
    )
  } catch (error) {
    console.error(`[webhooks] trigger error for ${eventType}:`, error)
  }
}

async function deliverWebhook(
  supabase: any,
  webhook: any,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const startTime = Date.now()
  try {
    const body = JSON.stringify(payload)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT)

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Event': eventType,
        'X-Relay-Signature': generateSignature(body, webhook.secret),
        'X-Relay-Timestamp': new Date().toISOString(),
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const duration = Date.now() - startTime

    // Log delivery
    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhook.id,
      event_type: eventType,
      payload,
      response_status: response.status,
      duration_ms: duration,
    })

    const newFailureCount = response.ok ? 0 : webhook.failure_count + 1

    await supabase
      .from('agent_webhooks')
      .update({
        last_triggered_at: new Date().toISOString(),
        failure_count: newFailureCount,
        // Auto-disable after MAX_FAILURES consecutive failures
        ...(newFailureCount >= MAX_FAILURES ? { is_active: false } : {}),
      })
      .eq('id', webhook.id)
  } catch (err) {
    const duration = Date.now() - startTime
    const newFailureCount = webhook.failure_count + 1

    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhook.id,
      event_type: eventType,
      payload,
      response_status: 0,
      response_body: err instanceof Error ? err.message : 'Unknown error',
      duration_ms: duration,
    }).catch(() => {})

    await supabase
      .from('agent_webhooks')
      .update({
        failure_count: newFailureCount,
        ...(newFailureCount >= MAX_FAILURES ? { is_active: false } : {}),
      })
      .eq('id', webhook.id)
      .catch(() => {})
  }
}

function generateSignature(body: string, secret: string): string {
  const sig = createHmac('sha256', secret || 'relay-default-secret')
    .update(body)
    .digest('hex')
  return `sha256=${sig}`
}
