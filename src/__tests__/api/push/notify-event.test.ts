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
const EVENT_ID = 'event-123'
const FAMILY_ID = 'fam-1'
const CALENDAR_ID = 'cal-1'

const mockEvent = {
  id: EVENT_ID,
  title: '생일 파티',
  start_at: '2026-04-15T09:00:00.000Z',
  calendar_id: CALENDAR_ID,
  family_id: FAMILY_ID,
}

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

const baseBody = { action: 'created', eventId: EVENT_ID }

/** events → family_members(검증) → calendar_members → push_subscriptions → update 순서로 mockFrom 세팅 */
function setupSendMocks() {
  // events 조회
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: mockEvent }),
  }))
  // family_members 멤버십 검증
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
  }))
  // calendar_members 조회 (본인 제외)
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockResolvedValue({ data: [{ user_id: 'user-2' }] }),
  }))
  // push_subscriptions 조회
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({
      data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'user-2' }],
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
    const res = await POST(makeRequest({ action: 'created' }))
    expect(res.status).toBe(400)
  })

  it('이벤트가 존재하지 않으면 404를 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }))
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(404)
  })

  it('actor가 가족 멤버가 아니면 403을 반환한다', async () => {
    // events 조회 성공
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockEvent }),
    }))
    // family_members 검증 실패
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }))
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('calendarId가 있으면 calendar_members를 조회하고 알림을 발송한다', async () => {
    setupSendMocks()
    mockSendNotification.mockResolvedValue({})

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const json = await res.json() as { sent: number }
    expect(json.sent).toBe(1)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'calendar_members')
  })

  it('calendarId가 null이면 family_members를 조회한다', async () => {
    const familyOnlyEvent = { ...mockEvent, calendar_id: null }
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: familyOnlyEvent }),
    }))
    // family_members 멤버십 검증
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
    }))
    // family_members 알림 대상 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({ data: [{ user_id: 'user-2' }] }),
    }))
    // push_subscriptions
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'user-2' }],
      }),
    }))
    // update last_used_at
    mockFrom.mockImplementationOnce(() => ({
      update: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null }),
    }))

    mockSendNotification.mockResolvedValue({})
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'family_members')
  })

  it('알림 대상이 없으면 sent: 0을 반환한다', async () => {
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockEvent }),
    }))
    // family_members 검증 성공
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
    }))
    // calendar_members 빈 결과
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({ data: [] }),
    }))

    const res = await POST(makeRequest(baseBody))
    const json = await res.json() as { sent: number }
    expect(json.sent).toBe(0)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('만료된 구독(410)은 삭제된다', async () => {
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockEvent }),
    }))
    // family_members 검증
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
    }))
    // calendar_members 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({ data: [{ user_id: 'user-2' }] }),
    }))
    // push_subscriptions 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: 'sub-1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'user-2' }],
      }),
    }))
    // delete stale subs (successIds 비어있어 update 생략, delete만 호출)
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
      await POST(makeRequest({ action, eventId: EVENT_ID }))
      expect(JSON.parse(mockSendNotification.mock.calls[0][1] as string).title).toBe(expected)
    }
  })

  it('알림 본문에 이벤트 제목이 포함된다', async () => {
    setupSendMocks()
    mockSendNotification.mockResolvedValue({})

    await POST(makeRequest(baseBody))
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1] as string) as { body: string }
    expect(payload.body).toContain('생일 파티')
  })
})
