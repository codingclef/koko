/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import {
  getAllowedAppRole,
  getAuthenticatedSessionUser,
  getAuthenticatedUser,
  isAppAdmin,
} from '@/lib/api-auth'

const mockGetClaims = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getClaims: (...args: unknown[]) => mockGetClaims(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

function makeRequest(token = 'token-123') {
  return new NextRequest('http://localhost/api/test', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeAllowedEmailChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'eq'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain)
  })
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: 'user-1', email: 'TEST@EXAMPLE.COM' } },
    error: null,
  })
  mockFrom.mockReturnValue(makeAllowedEmailChain({
    data: { app_role: 'member' },
    error: null,
  }))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('api-auth helpers', () => {
  it('getAuthenticatedSessionUser는 JWT claims에서 사용자 정보를 읽는다', async () => {
    await expect(getAuthenticatedSessionUser(makeRequest())).resolves.toEqual({
      id: 'user-1',
      email: 'TEST@EXAMPLE.COM',
    })
  })

  it('getAuthenticatedUser는 allowed_emails에 없으면 null을 반환한다', async () => {
    mockFrom.mockReturnValue(makeAllowedEmailChain({ data: null, error: null }))

    await expect(getAuthenticatedUser(makeRequest())).resolves.toBeNull()
  })

  it('getAuthenticatedUser는 allowed_emails 조회 실패를 삼키지 않는다', async () => {
    mockFrom.mockReturnValue(makeAllowedEmailChain({
      data: null,
      error: { message: 'DB unavailable' },
    }))

    await expect(getAuthenticatedUser(makeRequest())).rejects.toThrow(
      'Allowed email lookup failed'
    )
    expect(console.error).toHaveBeenCalledWith(
      '[api-auth] allowed email lookup failed:',
      { message: 'DB unavailable' }
    )
  })

  it('isAppAdmin은 app_role이 admin일 때만 true를 반환한다', async () => {
    mockFrom.mockReturnValue(makeAllowedEmailChain({
      data: { app_role: 'admin' },
      error: null,
    }))

    await expect(isAppAdmin('admin@example.com')).resolves.toBe(true)
  })

  it('getAllowedAppRole은 허용된 사용자의 역할을 반환한다', async () => {
    mockFrom.mockReturnValue(makeAllowedEmailChain({
      data: { app_role: 'admin' },
      error: null,
    }))

    await expect(getAllowedAppRole('ADMIN@EXAMPLE.COM')).resolves.toBe('admin')
  })
})
