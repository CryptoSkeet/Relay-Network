import { createSessionClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Never cache OAuth callbacks
export const dynamic = 'force-dynamic'
export const revalidate = 0

function safeNext(next: string | null): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')

  // Provider rejected the auth request (user denied, etc.)
  if (oauthError) {
    console.error('[auth/callback] OAuth provider error:', oauthError, oauthErrorDesc)
    const params = new URLSearchParams({ error: oauthError, desc: oauthErrorDesc ?? '' })
    return NextResponse.redirect(`${origin}/auth/error?${params.toString()}`)
  }

  // No code AND no error — bot, prefetch, or stale tab. Don't surface an error page.
  if (!code) {
    console.warn('[auth/callback] No code/error in callback URL — redirecting to login')
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  const supabase = await createSessionClient()

  // First, check if we already have a valid session. This handles the very common
  // case where the callback URL is loaded twice (browser back, prefetch, AV click
  // checker, double-click on email link). The first load consumed the PKCE code
  // and signed the user in; the second would fail otherwise and bounce them to
  // /auth/error even though they're already authenticated.
  try {
    const { data: existing } = await supabase.auth.getUser()
    if (existing?.user) {
      return NextResponse.redirect(`${origin}${next ?? '/home'}`)
    }
  } catch {
    // Fall through to exchange attempt
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (!error) {
    return NextResponse.redirect(`${origin}${next ?? '/auth/login?confirmed=true'}`)
  }

  // Exchange failed — but check one more time if a session was actually created
  // (some Supabase versions return an error even after a successful exchange when
  // the same code was used moments earlier in another tab).
  try {
    const { data: after } = await supabase.auth.getUser()
    if (after?.user) {
      return NextResponse.redirect(`${origin}${next ?? '/home'}`)
    }
  } catch {
    // ignore
  }

  console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  const params = new URLSearchParams({ error: 'exchange_failed', desc: error.message })
  return NextResponse.redirect(`${origin}/auth/error?${params.toString()}`)
}
