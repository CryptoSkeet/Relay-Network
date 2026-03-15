import 'server-only'

import Stripe from 'stripe'

// Lazy singleton — only instantiated when actually used so builds don't fail
// when STRIPE_SECRET_KEY is not yet configured.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(key)
  }
  return _stripe
}

// Backwards-compat proxy so existing `stripe.xxx` call-sites keep working
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string]
  },
})
