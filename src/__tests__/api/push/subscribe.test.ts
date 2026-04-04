/**
 * @jest-environment node
 */
import { POST } from '@/app/api/push/subscribe/route'
import { NextRequest } from 'next/server'

const mockUpsert: jest.Mock = jest.fn()
const mockFrom: jest.Mock = jest.fn(() => ({ upsert: mockUpsert }))

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (arg: unknown) => mockFrom(arg) }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/push/subscribe', {
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

describe('POST /api/push/subscribe', () => {
  it('필수 필드가 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({ userId: 'u1' }))
    expect(res.status).toBe(400)
  })

  it('모든 필드가 있으면 upsert 후 ok: true를 반환한다', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    const res = await POST(
      makeRequest({ userId: 'u1', endpoint: 'https://ep', p256dh: 'key', auth: 'auth' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://ep', p256dh: 'key', auth: 'auth' },
      { onConflict: 'endpoint' }
    )
  })

  it('DB 에러 발생 시 500을 반환한다', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } })
    const res = await POST(
      makeRequest({ userId: 'u1', endpoint: 'https://ep', p256dh: 'key', auth: 'auth' })
    )
    expect(res.status).toBe(500)
  })
})
