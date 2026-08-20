/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/me/route'
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()
const mockGetAuthenticatedSessionUser = jest.fn()
const mockGetAllowedAppRole = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: jest.fn() },
  }),
}))

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedSessionUser: (...args: unknown[]) => mockGetAuthenticatedSessionUser(...args),
  getAllowedAppRole: (...args: unknown[]) => mockGetAllowedAppRole(...args),
}))

function makeRequest() {
  return new NextRequest('http://localhost/api/family/me', { method: 'POST' })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockGetAuthenticatedSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
  mockGetAllowedAppRole.mockResolvedValue('member')
  mockRpc.mockResolvedValue({ data: 'fam-1', error: null })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/family/me', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedSessionUser.mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('familyId와 appRole을 반환한다', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-1')
    expect(body.appRole).toBe('member')
  })

  it('가족과 allowlist 조회를 같은 대기 구간에서 시작한다', async () => {
    let resolveFamily: (value: { data: string; error: null }) => void = () => undefined
    mockRpc.mockReturnValue(new Promise((resolve) => {
      resolveFamily = resolve
    }))

    const responsePromise = POST(makeRequest())
    await Promise.resolve()
    await Promise.resolve()

    expect(mockRpc).toHaveBeenCalledWith('get_my_family', { p_user_id: 'user-1' })
    expect(mockGetAllowedAppRole).toHaveBeenCalledWith('test@example.com')

    resolveFamily({ data: 'fam-1', error: null })
    await expect(responsePromise).resolves.toHaveProperty('status', 200)
  })

  it('가족이 없는 경우 familyId가 null이다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.familyId).toBeNull()
  })

  it('get_my_family RPC 에러 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
  })

  it('allowed_emails에 admin이면 appRole이 admin이다', async () => {
    mockGetAllowedAppRole.mockResolvedValue('admin')
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.appRole).toBe('admin')
  })

  it('allowlist 조회 결과가 없으면 401을 반환한다', async () => {
    mockGetAllowedAppRole.mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('allowlist 조회가 실패하면 500을 반환한다', async () => {
    mockGetAllowedAppRole.mockRejectedValue(new Error('DB unavailable'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(console.error).toHaveBeenCalledWith(
      '[API /family/me] bootstrap lookup failed:',
      expect.any(Error)
    )
  })
})
