/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/route'
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/family', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/family', () => {
  it('userId가 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('userId is required')
  })

  it('RPC 성공 시 familyId를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: 'fam-1', error: null })
    const res = await POST(makeRequest({ userId: 'user-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-1')
    expect(mockRpc).toHaveBeenCalledWith('get_or_create_family', { p_user_id: 'user-1' })
  })

  it('RPC 에러 발생 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
    const res = await POST(makeRequest({ userId: 'user-1' }))
    expect(res.status).toBe(500)
  })

  it('familyId가 null이면 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest({ userId: 'user-1' }))
    expect(res.status).toBe(500)
  })
})
