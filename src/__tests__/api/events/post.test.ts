/**
 * @jest-environment node
 */
import { POST } from '@/app/api/events/route'
import { NextRequest } from 'next/server'

const mockSendEventNotification = jest.fn()

jest.mock('@/lib/push-utils', () => ({
  sendEventNotification: (...args: unknown[]) => mockSendEventNotification(...args),
}))

const mockGetUser = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getUser: (token: unknown) => mockGetUser(token) },
    from: (table: unknown) => mockFrom(table),
  },
}))

const ACTOR_USER_ID = 'actor-user'
const FAMILY_ID = 'fam-1'

function makeRequest(body: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest('http://localhost/api/events', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
}

const baseBody = {
  calendarId: 'cal-1',
  title: '생일 파티',
  description: null,
  startAt: '2026-04-15T09:00:00.000Z',
  endAt: null,
  isAllDay: false,
  reminderMinutes: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

  mockGetUser.mockResolvedValue({
    data: { user: { id: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
})

describe('POST /api/events', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('unauthorized') })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(401)
  })

  it('title 누락 시 400을 반환한다', async () => {
    const res = await POST(makeRequest({ ...baseBody, title: '' }))
    expect(res.status).toBe(400)
  })

  it('가족 미소속이면 403을 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }))
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('이벤트를 생성하고 201을 반환한다', async () => {
    const mockEvent = { id: 'evt-1', title: '생일 파티', family_id: FAMILY_ID }

    // family_members 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { family_id: FAMILY_ID } }),
    }))
    // events insert
    mockFrom.mockImplementationOnce(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockEvent, error: null }),
    }))

    mockSendEventNotification.mockResolvedValue(undefined)

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(201)
    const json = await res.json() as { id: string }
    expect(json.id).toBe('evt-1')
  })

  it('reminderMinutes가 있으면 event_reminders에 insert한다', async () => {
    const mockEvent = { id: 'evt-1', title: '생일 파티', family_id: FAMILY_ID }

    // family_members 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { family_id: FAMILY_ID } }),
    }))
    // events insert
    mockFrom.mockImplementationOnce(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockEvent, error: null }),
    }))
    // event_reminders insert
    const reminderInsert = jest.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementationOnce(() => ({
      insert: reminderInsert,
    }))

    mockSendEventNotification.mockResolvedValue(undefined)

    await POST(makeRequest({ ...baseBody, reminderMinutes: [30, 60] }))
    expect(mockFrom).toHaveBeenCalledWith('event_reminders')
    expect(reminderInsert).toHaveBeenCalled()
  })
})
