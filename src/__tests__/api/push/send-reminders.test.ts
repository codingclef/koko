/**
 * @jest-environment node
 */
import { POST } from '@/app/api/cron/send-reminders/route'
import { NextRequest } from 'next/server'

const mockSendNotification = jest.fn()

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}))

// Supabase mock: rpc, from().select().in(), from().update().in(), from().delete().in()
let mockRpcResult: { data: unknown; error: unknown } = { data: [], error: null }
let mockMembersResult: { data: unknown } = { data: [] }
let mockSubsResult: { data: unknown } = { data: [] }

const mockChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
}

const mockRpc: jest.Mock = jest.fn(() => Promise.resolve(mockRpcResult))
const mockFrom: jest.Mock = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (arg: unknown) => mockRpc(arg), from: (arg: unknown) => mockFrom(arg) }),
}))

function makeRequest(secret = 'test-secret') {
  return new NextRequest('http://localhost/api/cron/send-reminders', {
    method: 'POST',
    body: '{}',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub-key'
  process.env.VAPID_PRIVATE_KEY = 'priv-key'
  process.env.CRON_SECRET = 'test-secret'
})

describe('POST /api/cron/send-reminders', () => {
  it('CRON_SECRET 불일치 시 401을 반환한다', async () => {
    const res = await POST(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('발송 대상이 없으면 sent: 0을 반환한다', async () => {
    mockRpcResult = { data: [], error: null }
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
  })

  it('RPC 에러 시 500을 반환한다', async () => {
    mockRpcResult = { data: null, error: { message: 'rpc error' } }
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
  })

  it('리마인더가 있고 구독이 있으면 web-push를 호출한다', async () => {
    mockRpcResult = {
      data: [{ reminder_id: 'r1', event_title: '회의', event_start: '2026-04-05T10:00:00Z', family_id: 'f1' }],
      error: null,
    }

    // family_members 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [{ user_id: 'u1', family_id: 'f1' }] }),
    }))
    // push_subscriptions 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'u1' }],
      }),
    }))
    // update last_used_at
    mockFrom.mockImplementationOnce(() => ({
      update: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null }),
    }))

    mockSendNotification.mockResolvedValue({ statusCode: 201 })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it('만료된 구독(410)은 삭제된다', async () => {
    mockRpcResult = {
      data: [{ reminder_id: 'r1', event_title: '회의', event_start: '2026-04-05T10:00:00Z', family_id: 'f1' }],
      error: null,
    }

    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [{ user_id: 'u1', family_id: 'f1' }] }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'u1' }],
      }),
    }))
    // delete stale subs
    const mockDelete = jest.fn().mockReturnThis()
    const mockDeleteIn = jest.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementationOnce(() => ({
      delete: mockDelete,
      in: mockDeleteIn,
    }))

    const err = Object.assign(new Error('Gone'), { statusCode: 410 })
    mockSendNotification.mockRejectedValue(err)

    const res = await POST(makeRequest())
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.removed).toBe(1)
  })
})
