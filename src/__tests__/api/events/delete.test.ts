/**
 * @jest-environment node
 */
import { DELETE } from '@/app/api/events/[id]/route'
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
const EVENT_ID = 'evt-1'
const FAMILY_ID = 'fam-1'
const CALENDAR_ID = 'cal-1'

const mockExisting = {
  id: EVENT_ID,
  title: '생일 파티',
  start_at: '2026-04-15T09:00:00.000Z',
  calendar_id: CALENDAR_ID,
  family_id: FAMILY_ID,
}

const mockExistingFamilyWide = { ...mockExisting, calendar_id: null }

function makeRequest(token = 'valid-token') {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeParams() {
  return { params: Promise.resolve({ id: EVENT_ID }) }
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

function mockEventFetch(existing: Record<string, unknown> | null = mockExisting) {
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(existing ? { data: existing } : { data: null }),
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

function mockFamilyAccess(isMember = true) {
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      isMember ? { data: { user_id: ACTOR_USER_ID } } : { data: null }
    ),
  }))
}

function mockEventDelete(error: unknown = null) {
  mockFrom.mockImplementationOnce(() => ({
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error }),
  }))
}

describe('DELETE /api/events/[id]', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('unauthorized') })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('이벤트가 없으면 404를 반환한다', async () => {
    mockEventFetch(null)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it('캘린더 미소속이면 403을 반환한다 (캘린더 이벤트)', async () => {
    mockEventFetch()
    mockCalendarAccess(true, false)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it('가족 미소속이면 403을 반환한다 (가족 전체 이벤트)', async () => {
    mockEventFetch(mockExistingFamilyWide)
    mockFamilyAccess(false)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it('이벤트를 삭제하고 204를 반환하며 알림을 보낸다', async () => {
    mockEventFetch()
    mockCalendarAccess()
    mockEventDelete()
    mockSendEventNotification.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', eventTitle: '생일 파티' })
    )
  })

  it('삭제 실패 시 500을 반환하고 알림을 보내지 않는다', async () => {
    mockEventFetch()
    mockCalendarAccess()
    mockEventDelete({ message: 'DB error' })

    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(500)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })
})
