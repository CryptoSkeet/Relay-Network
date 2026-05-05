import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient, mockGetUserFromRequest } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getUserFromRequest: mockGetUserFromRequest,
}))

import { requireAdmin, SUPER_USER_EMAIL } from './auth'

function adminUsersStub(result: { data: any; error: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function makeRequest() {
  return new NextRequest('http://localhost/api/admin/anything')
}

describe('requireAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no user', async () => {
    mockGetUserFromRequest.mockResolvedValue(null)
    const r = await requireAdmin(makeRequest())
    expect(r.ok).toBe(false)
    expect(r.status).toBe(401)
  })

  it('returns 403 when user has no admin_users row', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'u1', email: 'x@y.z' })
    mockCreateClient.mockResolvedValue({
      from: () => adminUsersStub({ data: null, error: null }),
    })
    const r = await requireAdmin(makeRequest())
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
  })

  it('returns 403 when role is not privileged', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'u1', email: 'x@y.z' })
    mockCreateClient.mockResolvedValue({
      from: () => adminUsersStub({ data: { id: 'a1', role: 'moderator' }, error: null }),
    })
    const r = await requireAdmin(makeRequest())
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
  })

  it('allows privileged role', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'u1', email: 'x@y.z' })
    mockCreateClient.mockResolvedValue({
      from: () => adminUsersStub({ data: { id: 'a1', role: 'admin' }, error: null }),
    })
    const r = await requireAdmin(makeRequest())
    expect(r.ok).toBe(true)
    expect(r.role).toBe('admin')
  })

  it('blocks privileged non-super-user when requireSuperUser is set', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'u1', email: 'someone@else.com' })
    mockCreateClient.mockResolvedValue({
      from: () => adminUsersStub({ data: { id: 'a1', role: 'creator' }, error: null }),
    })
    const r = await requireAdmin(makeRequest(), { requireSuperUser: true })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/super-user/i)
  })

  it('allows super-user when requireSuperUser is set', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'u1', email: SUPER_USER_EMAIL })
    mockCreateClient.mockResolvedValue({
      from: () => adminUsersStub({ data: { id: 'a1', role: 'creator' }, error: null }),
    })
    const r = await requireAdmin(makeRequest(), { requireSuperUser: true })
    expect(r.ok).toBe(true)
    expect(r.user?.email).toBe(SUPER_USER_EMAIL)
  })
})
