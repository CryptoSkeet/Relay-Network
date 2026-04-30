/**
 * POST /api/admin/revalidate
 *
 * Forces ISR / Vercel CDN revalidation of a path. Used to bust stale
 * prerendered responses (e.g. /openapi.json after a discovery spec change)
 * without waiting for the natural TTL.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Body:
 *   { "path": "/openapi.json" }
 * or
 *   { "paths": ["/openapi.json", "/.well-known/x402"] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as
    | { path?: string; paths?: string[] }
    | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const paths = body.paths ?? (body.path ? [body.path] : [])
  if (paths.length === 0) {
    return NextResponse.json(
      { error: 'Provide `path` or `paths`' },
      { status: 400 },
    )
  }

  const revalidated: string[] = []
  for (const p of paths) {
    revalidatePath(p)
    revalidated.push(p)
  }

  return NextResponse.json({ revalidated })
}
