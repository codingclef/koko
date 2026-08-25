/**
 * @jest-environment node
 */
import { POST } from '@/app/api/push/subscribe/route'
import { NextRequest } from 'next/server'

const mockUpsert: jest.Mock = jest.fn()
const mockDeleteFinalEq: jest.Mock = jest.fn()
const mockDeleteFirstEq: jest.Mock = jest.fn(() => ({ eq: mockDeleteFinalEq }))
const mockDelete: jest.Mock = jest.fn(() => ({ eq: mockDeleteFirstEq }))
const mockFrom: jest.Mock = jest.fn(() => ({ upsert: mockUpsert, delete: mockDelete }))
const mockGetAuthenticatedUserId = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (arg: unknown) => mockFrom(arg) },
}))

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserId: (...args: unknown[]) => mockGetAuthenticatedUserId(...args),
}))

function makeRequest(body: object = {}) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthenticatedUserId.mockResolvedValue('u1')
  mockDeleteFinalEq.mockResolvedValue({ error: null })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/push/subscribe', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null)
    const res = await POST(makeRequest({ endpoint: 'https://ep', p256dh: 'key', auth: 'auth' }))
    expect(res.status).toBe(401)
  })

  it('필수 필드가 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('모든 필드가 있으면 upsert 후 ok: true를 반환한다', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    const res = await POST(
      makeRequest({ endpoint: 'https://ep', p256dh: 'key', auth: 'auth' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://ep', p256dh: 'key', auth: 'auth' },
      { onConflict: 'endpoint' }
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('새 구독 저장 후 현재 사용자의 이전 endpoint를 정리한다', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    const res = await POST(
      makeRequest({
        endpoint: 'https://new-ep',
        p256dh: 'key',
        auth: 'auth',
        previousEndpoint: 'https://old-ep',
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, cleanupPending: false })
    expect(mockDeleteFirstEq).toHaveBeenCalledWith('user_id', 'u1')
    expect(mockDeleteFinalEq).toHaveBeenCalledWith('endpoint', 'https://old-ep')
  })

  it('이전 endpoint 정리 실패는 새 구독 성공을 되돌리지 않는다', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    mockDeleteFinalEq.mockResolvedValue({ error: { message: 'cleanup failed' } })
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(
      makeRequest({
        endpoint: 'https://new-ep',
        p256dh: 'key',
        auth: 'auth',
        previousEndpoint: 'https://old-ep',
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, cleanupPending: true })
    expect(error).toHaveBeenCalled()
  })

  it('DB 에러 발생 시 500을 반환한다', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } })
    const res = await POST(
      makeRequest({ endpoint: 'https://ep', p256dh: 'key', auth: 'auth' })
    )
    expect(res.status).toBe(500)
  })
})
