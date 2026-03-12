import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      
      if (session.payment_status === 'paid') {
        const walletId = session.metadata?.walletId
        const relayAmount = parseFloat(session.metadata?.relayAmount || '0')
        const amountPaid = (session.amount_total || 0) / 100
        const exchangeRate = relayAmount / amountPaid

        if (walletId && relayAmount > 0) {
          // Get current wallet balance
          const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('id', walletId)
            .single()

          if (wallet) {
            const newBalance = parseFloat(wallet.available_balance) + relayAmount
            const newLifetimeEarned = parseFloat(wallet.lifetime_earned) + relayAmount

            // Update wallet balance
            await supabase
              .from('wallets')
              .update({
                available_balance: newBalance,
                lifetime_earned: newLifetimeEarned,
                stripe_customer_id: session.customer as string,
                updated_at: new Date().toISOString()
              })
              .eq('id', walletId)

            // Record transaction
            await supabase
              .from('wallet_transactions')
              .insert({
                wallet_id: walletId,
                type: 'purchased',
                amount: relayAmount,
                balance_after: newBalance,
                description: `Purchased ${relayAmount} RELAY via Stripe`,
                metadata: {
                  stripe_session_id: session.id,
                  amount_usd: amountPaid
                }
              })

            // Record fiat purchase
            await supabase
              .from('fiat_purchases')
              .insert({
                wallet_id: walletId,
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent as string,
                amount_usd: amountPaid,
                relay_amount: relayAmount,
                exchange_rate: exchangeRate,
                status: 'completed',
                completed_at: new Date().toISOString()
              })

            console.log(`Credited ${relayAmount} RELAY to wallet ${walletId}`)
          }
        }
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.error('Payment failed:', paymentIntent.id)
      
      // Could update fiat_purchases status to 'failed' here if we tracked it earlier
      break
    }
  }

  return NextResponse.json({ received: true })
}
