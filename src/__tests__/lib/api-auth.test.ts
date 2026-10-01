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
const mockRpc = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getClaims: (...args: unknown[]) => mockGetClaims(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
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
  mockRpc.mockResolvedValue({
    data: { email: 'test@example.com', app_role: 'member', family_id: 'fam-1' },
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
  it('서명 검증 후 현재 계정의 이메일, 역할, 가족을 한 번에 조회한다', async () => {
    await expect(getAuthenticatedSessionUser(makeRequest())).resolves.toEqual({
      id: 'user-1',
      email: 'test@example.com',
      appRole: 'member',
      familyId: 'fam-1',
    })
    expect(mockRpc).toHaveBeenCalledWith('get_app_access', { p_user_id: 'user-1' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('getAuthenticatedUser는 allowed_emails에 없으면 null을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: { email: 'test@example.com', app_role: null, family_id: null }, error: null })

    await expect(getAuthenticatedUser(makeRequest())).resolves.toBeNull()
    // Active, unapproved accounts must still be able to redeem an invitation.
    await expect(getAuthenticatedSessionUser(makeRequest())).resolves.toMatchObject({ appRole: null })
  })

  it('현재 접근 권한 조회 실패 시 접근을 허용하지 않는다', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'DB unavailable' },
    })

    await expect(getAuthenticatedUser(makeRequest())).rejects.toThrow(
      'Live access lookup failed'
    )
    expect(console.error).toHaveBeenCalledWith(
      '[api-auth] live access lookup failed:',
      { message: 'DB unavailable' }
    )
  })

  it('유효한 JWT라도 현재 계정이 정지/삭제되어 있으면 거부한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    await expect(getAuthenticatedSessionUser(makeRequest())).resolves.toBeNull()
    await expect(getAuthenticatedUser(makeRequest())).resolves.toBeNull()
  })

  it('JWT 검증 실패 시 계정 조회를 하지 않는다', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: { message: 'invalid token' } })
    await expect(getAuthenticatedUser(makeRequest())).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('허용된 사용자 정보 반환 계약을 유지한다', async () => {
    await expect(getAuthenticatedUser(makeRequest())).resolves.toEqual({ id: 'user-1', email: 'test@example.com' })
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
