/**
 * @jest-environment node
 */
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    after: (callback: () => unknown) => callback(),
  }
})

import { POST } from '@/app/api/events/route'
import { NextRequest } from 'next/server'

const mockSendEventNotification = jest.fn()

jest.mock('@/lib/push-utils', () => ({
  sendEventNotification: (...args: unknown[]) => mockSendEventNotification(...args),
}))

const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockRpc = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getUser: (token: unknown) => mockGetUser(token) },
    from: (table: unknown) => mockFrom(table),
    rpc: (fn: unknown, args: unknown) => mockRpc(fn, args),
  },
}))

const ACTOR_USER_ID = 'actor-user'
const FAMILY_ID = 'fam-1'
const CALENDAR_ID = 'cal-1'
const CREATED_EVENT = { id: 'evt-1', title: '생일 파티', family_id: FAMILY_ID }

function makeRequest(body: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest('http://localhost/api/events', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
}

const baseBody = {
  calendarId: CALENDAR_ID,
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

function mockFamilyMember(found = true) {
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      found ? { data: { family_id: FAMILY_ID } } : { data: null }
    ),
  }))
}

function mockCalendarAccess(calendarFound = true, isMember = true) {
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      calendarFound ? { data: { id: CALENDAR_ID } } : { data: null }
    ),
  }))
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      isMember ? { data: { user_id: ACTOR_USER_ID } } : { data: null }
    ),
  }))
}

function mockRpcSuccess(event = CREATED_EVENT) {
  mockRpc.mockResolvedValue({ data: [event], error: null })
}

function mockRpcFailure() {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
}

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
    mockFamilyMember(false)
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('캘린더가 해당 가족 소속이 아니면 403을 반환한다', async () => {
    mockFamilyMember()
    mockCalendarAccess(false)
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('캘린더 멤버가 아니면 403을 반환한다', async () => {
    mockFamilyMember()
    mockCalendarAccess(true, false)
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('이벤트를 생성하고 201을 반환한다', async () => {
    mockFamilyMember()
    mockCalendarAccess()
    mockRpcSuccess()
    mockSendEventNotification.mockResolvedValue(undefined)

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(201)
    const json = await res.json() as { id: string }
    expect(json.id).toBe('evt-1')
  })

  it('create_event_with_reminders RPC를 호출한다', async () => {
    mockFamilyMember()
    mockCalendarAccess()
    mockRpcSuccess()

    await POST(makeRequest({ ...baseBody, reminderMinutes: [30, 60] }))
    expect(mockRpc).toHaveBeenCalledWith(
      'create_event_with_reminders',
      expect.objectContaining({ p_reminder_minutes: [30, 60] })
    )
  })

  it('calendarId가 null이면 캘린더 검증을 건너뛴다', async () => {
    mockFamilyMember()
    mockRpcSuccess()
    mockSendEventNotification.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ ...baseBody, calendarId: null }))
    expect(res.status).toBe(201)
    expect(mockFrom).not.toHaveBeenCalledWith('calendars')
  })

  it('RPC 실패 시 500을 반환한다', async () => {
    mockFamilyMember()
    mockCalendarAccess()
    mockRpcFailure()

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(500)
  })
})
