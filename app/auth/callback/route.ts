import { createSessionClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')

  if (oauthError) {
    console.error('[auth/callback] OAuth provider error:', oauthError, oauthErrorDesc)
    const params = new URLSearchParams({ error: oauthError, desc: oauthErrorDesc ?? '' })
    return NextResponse.redirect(`${origin}/auth/error?${params.toString()}`)
  }

  if (code) {
    // Use the cookie-aware session client so the PKCE verifier cookie is read
    const supabase = await createSessionClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If `next` is a safe relative path, redirect there (used by claim flow)
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        return NextResponse.redirect(`${origin}${next}`)
      }
      return NextResponse.redirect(`${origin}/auth/login?confirmed=true`)
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    const params = new URLSearchParams({ error: 'exchange_failed', desc: error.message })
    return NextResponse.redirect(`${origin}/auth/error?${params.toString()}`)
  }

  console.error('[auth/callback] No code in callback URL:', request.url)
  return NextResponse.redirect(`${origin}/auth/error?error=no_code`)
}
