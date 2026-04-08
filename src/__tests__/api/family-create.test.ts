/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/create/route'
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()
const mockGetAuthenticatedUserId = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserId: (...args: unknown[]) => mockGetAuthenticatedUserId(...args),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/family/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthenticatedUserId.mockResolvedValue('user-1')
  mockRpc.mockResolvedValue({ data: 'fam-new', error: null })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/family/create', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const res = await POST(makeRequest({ name: '우리집' }))
    expect(res.status).toBe(401)
  })

  it('name이 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('공백만 있는 name이면 400을 반환한다', async () => {
    const res = await POST(makeRequest({ name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('성공 시 familyId를 반환한다', async () => {
    const res = await POST(makeRequest({ name: '우리집' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-new')
    expect(mockRpc).toHaveBeenCalledWith('create_family_with_name', {
      p_user_id: 'user-1',
      p_name: '우리집',
    })
  })

  it('RPC 에러 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'error' } })
    const res = await POST(makeRequest({ name: '우리집' }))
    expect(res.status).toBe(500)
  })
})
