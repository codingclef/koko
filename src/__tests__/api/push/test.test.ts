/**
 * @jest-environment node
 */
import { POST } from '@/app/api/push/test/route'
import { NextRequest } from 'next/server'

const mockGetAuthenticatedUser = jest.fn()
const mockIsAppAdmin = jest.fn()
const mockFrom = jest.fn()
const mockSendNotification = jest.fn()

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  isAppAdmin: (...args: unknown[]) => mockIsAppAdmin(...args),
}))

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}))

jest.mock('@/lib/webpush', () => ({
  __esModule: true,
  default: { sendNotification: (...args: unknown[]) => mockSendNotification(...args) },
}))

function makeRequest(body: object = {}) {
  return new NextRequest('http://localhost/api/push/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSubscriptionQuery(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'eq'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain)
  })
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
  mockIsAppAdmin.mockResolvedValue(false)
  mockFrom.mockReturnValue(makeSubscriptionQuery({
    data: [{ endpoint: 'https://push.example', p256dh: 'p256dh', auth: 'auth' }],
    error: null,
  }))
  mockSendNotification.mockResolvedValue(undefined)
})

describe('POST /api/push/test', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)

    const res = await POST(makeRequest({ userId: 'user-1' }))

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('다른 사용자의 테스트 알림은 앱 관리자만 보낼 수 있다', async () => {
    const res = await POST(makeRequest({ userId: 'user-2' }))

    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('본인 구독에는 테스트 알림을 보낼 수 있다', async () => {
    const res = await POST(makeRequest({ userId: 'user-1' }))

    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it('앱 관리자는 다른 사용자 구독에도 테스트 알림을 보낼 수 있다', async () => {
    mockIsAppAdmin.mockResolvedValue(true)

    const res = await POST(makeRequest({ userId: 'user-2' }))

    expect(res.status).toBe(200)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })
})
