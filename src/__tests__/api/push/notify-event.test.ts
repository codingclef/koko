/**
 * @jest-environment node
 */
import { POST } from '@/app/api/push/notify-event/route'
import { NextRequest } from 'next/server'

const mockSendNotification = jest.fn()

jest.mock('@/lib/webpush', () => ({
  __esModule: true,
  default: { sendNotification: (...args: unknown[]) => mockSendNotification(...args) },
}))

const mockGetUser = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getUser: (token: unknown) => mockGetUser(token) },
    from: (table: unknown) => mockFrom(table),
  },
}))

function makeRequest(body: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest('http://localhost/api/push/notify-event', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
}

const ACTOR_USER_ID = 'actor-user'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub-key'
  process.env.VAPID_PRIVATE_KEY = 'priv-key'

  mockGetUser.mockResolvedValue({
    data: { user: { id: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
})

const baseBody = {
  action: 'created',
  title: '생일 파티',
  startAt: '2026-04-15T09:00:00.000Z',
  familyId: 'fam-1',
  calendarId: 'cal-1',
}

/** calendar_members → push_subscriptions → update last_used_at 순서로 mockFrom 세팅 */
function setupSendMocks(otherUserId = 'user-2') {
  // calendar_members 조회 (actor 포함)
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({
      data: [{ user_id: ACTOR_USER_ID }, { user_id: otherUserId }],
    }),
  }))
  // push_subscriptions 조회
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({
      data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: otherUserId }],
    }),
  }))
  // update last_used_at
  mockFrom.mockImplementationOnce(() => ({
    update: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ error: null }),
  }))
}

describe('POST /api/push/notify-event', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('unauthorized') })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(401)
  })

  it('필수 필드 누락 시 400을 반환한다', async () => {
    const res = await POST(makeRequest({ action: 'created', familyId: 'fam-1' }))
    expect(res.status).toBe(400)
  })

  it('actor가 캘린더 멤버가 아니면 403을 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ user_id: 'other-user' }] }),
    }))
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('actor가 가족 멤버가 아니면 403을 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ user_id: 'other-user' }] }),
    }))
    const res = await POST(makeRequest({ ...baseBody, calendarId: null }))
    expect(res.status).toBe(403)
  })

  it('calendarId가 있으면 calendar_members를 조회한다', async () => {
    setupSendMocks()
    mockSendNotification.mockResolvedValue({})

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const json = await res.json() as { sent: number }
    expect(json.sent).toBe(1)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'calendar_members')
  })

  it('calendarId가 null이면 family_members를 조회한다', async () => {
    // family_members 조회 (actor 포함)
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [{ user_id: ACTOR_USER_ID }, { user_id: 'user-2' }],
      }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'user-2' }],
      }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      update: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null }),
    }))

    mockSendNotification.mockResolvedValue({})

    const res = await POST(makeRequest({ ...baseBody, calendarId: null }))
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'family_members')
  })

  it('actor 혼자만 있는 그룹이면 sent: 0을 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ user_id: ACTOR_USER_ID }] }),
    }))

    const res = await POST(makeRequest(baseBody))
    const json = await res.json() as { sent: number }
    expect(json.sent).toBe(0)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('push 구독이 없으면 sent: 0을 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [{ user_id: ACTOR_USER_ID }, { user_id: 'user-2' }],
      }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [] }),
    }))

    const res = await POST(makeRequest(baseBody))
    const json = await res.json() as { sent: number }
    expect(json.sent).toBe(0)
  })

  it('만료된 구독(410)은 삭제된다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [{ user_id: ACTOR_USER_ID }, { user_id: 'user-2' }],
      }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'user-2' }],
      }),
    }))
    mockFrom.mockImplementationOnce(() => ({
      delete: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null }),
    }))

    const err = Object.assign(new Error('Gone'), { statusCode: 410 })
    mockSendNotification.mockRejectedValue(err)

    const res = await POST(makeRequest(baseBody))
    const json = await res.json() as { sent: number; removed: number }
    expect(json.sent).toBe(0)
    expect(json.removed).toBe(1)
  })

  it('action별 알림 제목이 올바르다', async () => {
    mockSendNotification.mockResolvedValue({})

    for (const [action, expected] of [
      ['created', '새 일정이 추가됐어요'],
      ['updated', '일정이 변경됐어요'],
      ['deleted', '일정이 삭제됐어요'],
    ] as const) {
      jest.clearAllMocks()
      setupSendMocks()
      await POST(makeRequest({ ...baseBody, action }))
      expect(JSON.parse(mockSendNotification.mock.calls[0][1] as string).title).toBe(expected)
    }
  })
})
