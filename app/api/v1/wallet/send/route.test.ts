import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient, mockGetUserFromRequest, mockCheckRateLimit } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUserFromRequest: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getUserFromRequest: mockGetUserFromRequest,
}))

vi.mock('@/lib/solana/relay-token', () => ({
  transferRelayOnChain: vi.fn(),
  ensureAgentWallet: vi.fn(),
}))

vi.mock('@/lib/ratelimit', async () => {
  return {
    financialMutationRateLimit: { name: 'financialMutationRateLimit' },
    checkRateLimit: mockCheckRateLimit,
    rateLimitResponse: (retryAfter: number = 3600) => new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Remaining': '0',
        },
      }
    ),
  }
})

import { POST } from './route'

describe('POST /api/v1/wallet/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({})
    mockGetUserFromRequest.mockResolvedValue({ id: 'user-1' })
  })

  it('returns 429 when financial rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfter: 30,
    })

    const request = new NextRequest('http://localhost/api/v1/wallet/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.7',
      },
      body: JSON.stringify({
        recipient_handle: 'target-agent',
        amount: 5,
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toBe('Rate limit exceeded')
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      { name: 'financialMutationRateLimit' },
      'wallet-send:user-1:203.0.113.7'
    )
  })
})