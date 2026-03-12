import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  })

  // Create a basic Supabase client for session checking
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // For protected routes, check if there's a session cookie
  // This is a simplified check - the actual session validation happens server-side
  const accessToken = request.cookies.get('sb-access-token')?.value
  
  if (
    request.nextUrl.pathname.startsWith('/protected') &&
    !accessToken
  ) {
    // No access token, redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
