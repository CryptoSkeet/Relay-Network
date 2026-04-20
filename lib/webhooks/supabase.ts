// Supabase database webhook helpers.
//
// Webhooks fire SIDE EFFECTS ONLY — never critical-path money operations.
// Escrow funding, payment release, and on-chain settlement are synchronous
// in the API routes that mutate the data. Webhooks add: notifications,
// audit log entries, search indexing, future SSE fan-out.
//
// Supabase database webhooks send at-least-once. We dedupe via an
// idempotency table keyed on (table, op, record_id, occurred_at).

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

export type SupabaseDbWebhookOp = 'INSERT' | 'UPDATE' | 'DELETE'

export interface SupabaseDbWebhookPayload<T = Record<string, any>> {
  type: SupabaseDbWebhookOp
  table: string
  schema: string
  record: T
  old_record: T | null
}

export function verifyWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.SUPABASE_WEBHOOK_SECRET
  if (!expected || !headerValue) return false
  const a = Buffer.from(headerValue)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}

/**
 * Idempotency check. Returns true if we've already processed this event,
 * false otherwise (and records that we've now seen it).
 *
 * Uses the `webhook_events` table (created on first call) — pure DB,
 * no Redis required so this works without extra infra.
 */
export async function alreadyProcessed(
  supabase: ReturnType<typeof createClient>,
  payload: SupabaseDbWebhookPayload,
): Promise<boolean> {
  const recordId = (payload.record as any)?.id ?? (payload.old_record as any)?.id
  if (!recordId) return false

  // Composite key — Supabase webhooks may retry the SAME state transition,
  // so include updated_at/created_at when present so a legitimate later
  // update isn't treated as a duplicate.
  const ts =
    (payload.record as any)?.updated_at ??
    (payload.record as any)?.created_at ??
    new Date().toISOString()

  const eventKey = `${payload.table}:${payload.type}:${recordId}:${ts}`

  const { error } = await supabase
    .from('webhook_events')
    .insert({ event_key: eventKey })

  // 23505 = unique_violation → already processed
  if (error && (error as any).code === '23505') return true
  return false
}

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service-role env vars missing')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
