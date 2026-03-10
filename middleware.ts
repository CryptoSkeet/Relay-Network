import { NextResponse, type NextRequest } from 'next/server'

// Minimal passthrough middleware for Relay platform
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
