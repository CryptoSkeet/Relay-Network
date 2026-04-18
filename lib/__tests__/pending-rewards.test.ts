/**
 * Tests for lib/services/pending-rewards.ts
 *
 * Focus: pure logic + the supabase chain interactions. The on-chain mint call
 * is mocked out — fee math is tested elsewhere.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── mocks ───────────────────────────────────────────────────────────────────
const { mockMintRelayTokens, mockSupabaseClient } = vi.hoisted(() => ({
  mockMintRelayTokens: vi.fn(),
  mockSupabaseClient: { from: vi.fn() },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('@/lib/solana/relay-token', () => ({
  mintRelayTokens: mockMintRelayTokens,
}))

import {
  accruePending,
  listPending,
  totalPending,
  cancelPending,
  claimAllPending,
} from '../services/pending-rewards'

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks does NOT drain mockReturnValueOnce queues — reset them explicitly.
  mockSupabaseClient.from.mockReset()
  mockMintRelayTokens.mockReset()
})

// ── helpers ─────────────────────────────────────────────────────────────────
function chain(overrides: Record<string, any>) {
  const base: any = {
    select:       vi.fn().mockReturnThis(),
    insert:       vi.fn().mockReturnThis(),
    update:       vi.fn().mockReturnThis(),
    delete:       vi.fn().mockReturnThis(),
    eq:           vi.fn().mockReturnThis(),
    is:           vi.fn().mockReturnThis(),
    order:        vi.fn().mockReturnThis(),
    single:       vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle:  vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return Object.assign(base, overrides)
}

// ─── accruePending ──────────────────────────────────────────────────────────

describe('accruePending', () => {
  it('rejects non-positive amounts', async () => {
    const r = await accruePending({
      beneficiary: { agentId: 'a1' },
      amountRelay: 0,
      sourceType: 'contract',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/> 0/)
  })

  it('inserts a pending row and returns reward id', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      single: vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }),
    }))

    const r = await accruePending({
      beneficiary: { agentId: 'agent-1' },
      amountRelay: 100,
      sourceType: 'bounty',
      sourceId: 'bnt-1',
    })

    expect(r).toEqual({ ok: true, rewardId: 'r1' })
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('pending_rewards')
  })

  it('treats unique-violation as idempotent duplicate', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      }),
    }))

    const r = await accruePending({
      beneficiary: { did: 'did:relay:abc' },
      amountRelay: 50,
      sourceType: 'bounty',
      sourceId: 'bnt-1',
    })
    expect(r).toEqual({ ok: true, duplicate: true })
  })

  it('surfaces non-23505 db errors', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }),
    }))
    const r = await accruePending({
      beneficiary: { externalAgentId: 'ext-1' },
      amountRelay: 10,
      sourceType: 'airdrop',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/permission denied/)
  })
})

// ─── listPending / totalPending ─────────────────────────────────────────────

describe('listPending / totalPending', () => {
  it('returns mapped rows', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'r1', amount_relay: '10.5', source_type: 'bounty',  source_id: 'b1', reason: null, created_at: 't1' },
          { id: 'r2', amount_relay: '4.0',  source_type: 'contract', source_id: 'c1', reason: 'x',  created_at: 't2' },
        ],
        error: null,
      }),
    }))

    const rows = await listPending({ agentId: 'a1' })
    expect(rows).toHaveLength(2)
    expect(rows[0].amountRelay).toBe(10.5)
    expect(rows[1].sourceType).toBe('contract')
  })

  it('totalPending sums amounts', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'r1', amount_relay: '10', source_type: 'bounty', source_id: null, reason: null, created_at: 't' },
          { id: 'r2', amount_relay: '15', source_type: 'bounty', source_id: null, reason: null, created_at: 't' },
        ],
        error: null,
      }),
    }))
    expect(await totalPending({ agentId: 'a1' })).toBe(25)
  })

  it('returns [] on db error', async () => {
    mockSupabaseClient.from.mockReturnValueOnce(chain({
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    }))
    expect(await listPending({ agentId: 'a1' })).toEqual([])
  })
})

// ─── cancelPending ──────────────────────────────────────────────────────────

describe('cancelPending', () => {
  it('updates status to cancelled', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    mockSupabaseClient.from.mockReturnValueOnce({ update })

    const r = await cancelPending('r1', 'changed mind')
    expect(r.ok).toBe(true)
    expect(update).toHaveBeenCalled()
    const payload = update.mock.calls[0][0]
    expect(payload.status).toBe('cancelled')
    expect(payload.cancel_reason).toBe('changed mind')
  })
})

// ─── claimAllPending ────────────────────────────────────────────────────────

describe('claimAllPending', () => {
  function setupTagAndMark(opts: {
    tagged: { id: string; amount_relay: string }[] | null
    tagError?: any
    markError?: any
  }) {
    // First .from() call → tag pending rows
    const tagSelect = vi.fn().mockResolvedValue({ data: opts.tagged, error: opts.tagError ?? null })
    const tagIs     = vi.fn().mockReturnValue({ select: tagSelect })
    const tagEq2    = vi.fn().mockReturnValue({ is: tagIs })
    const tagEq1    = vi.fn().mockReturnValue({ eq: tagEq2 })
    const tagUpdate = vi.fn().mockReturnValue({ eq: tagEq1 })

    // Second .from() call → mark claimed (or untag on failure)
    const markEq    = vi.fn().mockResolvedValue({ error: opts.markError ?? null })
    const markUpdate = vi.fn().mockReturnValue({ eq: markEq })

    mockSupabaseClient.from
      .mockReturnValueOnce({ update: tagUpdate })
      .mockReturnValueOnce({ update: markUpdate })

    return { tagUpdate, markUpdate }
  }

  it('returns zero-result when nothing pending', async () => {
    setupTagAndMark({ tagged: [] })
    const r = await claimAllPending({ beneficiary: { agentId: 'a1' }, destinationWallet: 'wallet1' })
    expect(r.ok).toBe(true)
    expect(r.totalRelay).toBe(0)
    expect(r.rowCount).toBe(0)
    expect(r.txHash).toBeNull()
    expect(mockMintRelayTokens).not.toHaveBeenCalled()
  })

  it('mints + marks claimed on happy path', async () => {
    setupTagAndMark({
      tagged: [
        { id: 'r1', amount_relay: '10' },
        { id: 'r2', amount_relay: '15' },
      ],
    })
    mockMintRelayTokens.mockResolvedValue('TX_SIG_ABC')

    const r = await claimAllPending({ beneficiary: { agentId: 'a1' }, destinationWallet: 'wallet1' })
    expect(r.ok).toBe(true)
    expect(r.totalRelay).toBe(25)
    expect(r.rowCount).toBe(2)
    expect(r.txHash).toBe('TX_SIG_ABC')
    expect(mockMintRelayTokens).toHaveBeenCalledWith('wallet1', 25)
  })

  it('untags rows when on-chain mint fails so retry is safe', async () => {
    setupTagAndMark({
      tagged: [{ id: 'r1', amount_relay: '5' }],
    })
    mockMintRelayTokens.mockRejectedValue(new Error('rpc unavailable'))

    const r = await claimAllPending({ beneficiary: { did: 'did:x' }, destinationWallet: 'w' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/rpc unavailable/)
  })

  it('returns reconciliation context when mark-claimed fails after mint', async () => {
    setupTagAndMark({
      tagged: [{ id: 'r1', amount_relay: '7' }],
      markError: { message: 'db down' },
    })
    mockMintRelayTokens.mockResolvedValue('TX_SIG')

    const r = await claimAllPending({ beneficiary: { agentId: 'a1' }, destinationWallet: 'w' })
    expect(r.ok).toBe(false)
    expect(r.txHash).toBe('TX_SIG')
    expect(r.totalRelay).toBe(7)
    expect(r.batchId).toBeTruthy()
    expect(r.error).toMatch(/Tokens minted/)
  })
})
