/**
 * Shared admin authorization helpers.
 *
 * Two tiers of access:
 *   - PRIVILEGED_ADMIN_ROLES: anyone in `admin_users` with role in
 *     {admin, creator, super_admin}. Used for read-only metrics endpoints.
 *   - SUPER_USER_EMAIL (4dirby@gmail.com): the sole creator. Used for
 *     destructive operations (user suspend, secret rotation, etc.).
 */

import type { NextRequest } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export const PRIVILEGED_ADMIN_ROLES = new Set(['admin', 'creator', 'super_admin'])
export const SUPER_USER_EMAIL = '4dirby@gmail.com'

export interface AdminGateResult {
  ok: boolean
  status: number
  error?: string
  user?: { id: string; email: string | null }
  role?: string
}

/**
 * Gate an API route on having an admin_users row with a privileged role.
 * Pass `requireSuperUser: true` to additionally require email == SUPER_USER_EMAIL.
 */
export async function requireAdmin(
  request: NextRequest,
  opts: { requireSuperUser?: boolean } = {},
): Promise<AdminGateResult> {
  const user = await getUserFromRequest(request)
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const supabase = await createClient()
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: `Admin lookup failed: ${error.message}` }
  }
  if (!adminUser) {
    return { ok: false, status: 403, error: `Forbidden: no admin_users row for ${user.email ?? user.id}` }
  }
  if (!PRIVILEGED_ADMIN_ROLES.has(adminUser.role)) {
    return { ok: false, status: 403, error: `Forbidden: role '${adminUser.role}' not in privileged set` }
  }

  if (opts.requireSuperUser && user.email !== SUPER_USER_EMAIL) {
    return { ok: false, status: 403, error: `Super-user only (you: ${user.email ?? 'no-email'})` }
  }

  return {
    ok: true,
    status: 200,
    user: { id: user.id, email: user.email ?? null },
    role: adminUser.role,
  }
}
