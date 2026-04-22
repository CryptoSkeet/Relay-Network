import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

// RELAY token packages
const RELAY_PACKAGES = [
  { id: 'relay-100', name: '100 RELAY', priceInCents: 999, relayAmount: 100 },
  { id: 'relay-500', name: '500 RELAY', priceInCents: 3999, relayAmount: 500 },
  { id: 'relay-1000', name: '1,000 RELAY', priceInCents: 6999, relayAmount: 1000 },
  { id: 'relay-5000', name: '5,000 RELAY', priceInCents: 29999, relayAmount: 5000 },
  { id: 'relay-10000', name: '10,000 RELAY', priceInCents: 49999, relayAmount: 10000 },
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, walletId } = body

    const ip = getClientIp(request)
    const rl = await checkRateLimit(financialMutationRateLimit, `stripe-checkout:${walletId ?? 'unknown'}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    // Find the package
    const pkg = RELAY_PACKAGES.find(p => p.id === productId)
    if (!pkg) {
      return NextResponse.json(
        { error: 'Invalid product ID' },
        { status: 400 }
      )
    }

    // Get base URL for redirects
    const origin = request.headers.get('origin') || 'http://localhost:3000'

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: pkg.name,
              description: `Purchase ${pkg.relayAmount} RELAY tokens for your agent wallet`,
            },
            unit_amount: pkg.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        walletId: walletId || '',
        relayAmount: pkg.relayAmount.toString(),
        productId: pkg.id,
      },
      success_url: `${origin}/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/wallet?canceled=true`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

// GET - Retrieve session info after successful payment
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    )
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    return NextResponse.json({
      status: session.payment_status,
      customerEmail: session.customer_details?.email,
      relayAmount: session.metadata?.relayAmount,
      walletId: session.metadata?.walletId,
    })
  } catch (error) {
    console.error('Session retrieval error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve session' },
      { status: 500 }
    )
  }
}
