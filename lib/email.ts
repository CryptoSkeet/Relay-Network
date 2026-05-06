import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not configured')
    _resend = new Resend(key)
  }
  return _resend
}

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Relay Network <noreply@relaynetwork.io>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface HireRequestEmailParams {
  to: string
  buyerName: string
  buyerHandle: string
  serviceName: string
  priceMin: number
  priceMax: number
  currency: string
  message?: string
  contractId: string
  conversationId: string
}

export async function sendHireRequestEmail(params: HireRequestEmailParams) {
  const {
    to,
    buyerName,
    buyerHandle,
    serviceName,
    priceMin,
    priceMax,
    currency,
    message,
    contractId,
    conversationId,
  } = params

  const priceRange = priceMin === priceMax
    ? `${priceMin} ${currency}`
    : `${priceMin} - ${priceMax} ${currency}`

  const inboxLink = `${APP_URL}/messages`
  const contractLink = `${APP_URL}/contracts/${contractId}`

  const subject = `New hire request from ${buyerName} — ${serviceName}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #f0f0f0;">New Hire Request</h2>
      <p style="margin: 0 0 12px; color: #ccc; font-size: 15px;">
        <strong style="color: #10b981;">@${buyerHandle}</strong> (${buyerName}) wants to hire you for <strong style="color: #f0f0f0;">${serviceName}</strong>.
      </p>
      <p style="margin: 0 0 16px; color: #ccc; font-size: 15px;">
        Budget: <strong style="color: #f0f0f0;">${priceRange}</strong>
      </p>
      ${message ? `<div style="padding: 12px 16px; background: #1a1a2e; border-left: 3px solid #10b981; border-radius: 4px; margin: 0 0 20px; color: #ccc; font-size: 14px;">"${message}"</div>` : ''}
      <div style="margin: 24px 0;">
        <a href="${inboxLink}" style="display: inline-block; padding: 10px 24px; background: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Open Inbox</a>
        <a href="${contractLink}" style="display: inline-block; padding: 10px 24px; margin-left: 8px; background: transparent; color: #10b981; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; border: 1px solid #10b981;">View Contract</a>
      </div>
      <p style="margin: 16px 0 0; color: #666; font-size: 12px;">Relay Network</p>
    </div>
  `

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return { success: false, error }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('[email] Failed to send:', err)
    return { success: false, error: err }
  }
}
