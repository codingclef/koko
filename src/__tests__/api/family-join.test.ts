/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/join/route'
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()
const mockGetAuthenticatedUserId = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserId: (...args: unknown[]) => mockGetAuthenticatedUserId(...args),
}))

function makeRequest(body: object = {}) {
  return new NextRequest('http://localhost/api/family/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthenticatedUserId.mockResolvedValue('user-1')
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/family/join', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const res = await POST(makeRequest({ inviteCode: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('inviteCode가 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('잘못된 inviteCode이면 404를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest({ inviteCode: 'INVALID' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Invalid invite code')
  })

  it('RPC 성공 시 familyId를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: 'fam-2', error: null })
    const res = await POST(makeRequest({ inviteCode: 'XYZ999' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-2')
    expect(mockRpc).toHaveBeenCalledWith('join_family_by_invite_code', {
      p_user_id: 'user-1',
      p_invite_code: 'XYZ999',
      p_display_name: null,
    })
  })

  it('RPC 에러 발생 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const res = await POST(makeRequest({ inviteCode: 'ABC123' }))
    expect(res.status).toBe(500)
  })

  it('displayName이 제공되면 해당 이름으로 합류한다', async () => {
    mockRpc.mockResolvedValue({ data: 'fam-1', error: null })
    const res = await POST(makeRequest({ inviteCode: 'ABC123', displayName: '엄마' }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('join_family_by_invite_code', {
      p_user_id: 'user-1',
      p_invite_code: 'ABC123',
      p_display_name: '엄마',
    })
  })

  it('빈 displayName은 null로 정규화한다', async () => {
    mockRpc.mockResolvedValue({ data: 'fam-1', error: null })
    const res = await POST(makeRequest({ inviteCode: 'ABC123', displayName: '   ' }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('join_family_by_invite_code', {
      p_user_id: 'user-1',
      p_invite_code: 'ABC123',
      p_display_name: null,
    })
  })
})
