/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/me/route'
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockGetAuthenticatedUser = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  }),
}))

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
}))

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'eq'].forEach((m) => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  return chain
}

function makeRequest() {
  return new NextRequest('http://localhost/api/family/me', { method: 'POST' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
  mockRpc.mockResolvedValue({ data: 'fam-1', error: null })
  mockFrom.mockReturnValue(makeChain({ data: { app_role: 'member' }, error: null }))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/family/me', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
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
    mockFrom.mockReturnValue(makeChain({ data: { app_role: 'admin' }, error: null }))
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.appRole).toBe('admin')
  })

  it('appRole 조회 결과가 없으면 member 기본값이다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.appRole).toBe('member')
  })
})
