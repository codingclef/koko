/**
 * @jest-environment node
 */
import { PATCH } from '@/app/api/events/[id]/route'
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

const mockExisting = {
  id: EVENT_ID,
  title: '기존 제목',
  start_at: '2026-04-15T09:00:00.000Z',
  end_at: null,
  description: null,
  calendar_id: 'cal-1',
  is_all_day: false,
  family_id: FAMILY_ID,
}

function makeRequest(body: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

function setupPatchMocks(overrides: { notFound?: boolean; forbidden?: boolean } = {}) {
  // events 조회
  mockFrom.mockImplementationOnce(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      overrides.notFound ? { data: null } : { data: mockExisting, error: null }
    ),
  }))

  if (!overrides.notFound) {
    // family_members 검증
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(
        overrides.forbidden ? { data: null } : { data: { user_id: ACTOR_USER_ID } }
      ),
    }))
  }

  if (!overrides.notFound && !overrides.forbidden) {
    // events update
    mockFrom.mockImplementationOnce(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    }))
  }
}

describe('PATCH /api/events/[id]', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('unauthorized') })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('이벤트가 없으면 404를 반환한다', async () => {
    setupPatchMocks({ notFound: true })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(404)
  })

  it('가족 미소속이면 403을 반환한다', async () => {
    setupPatchMocks({ forbidden: true })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(403)
  })

  it('변경사항 없으면 204를 반환하고 알림을 보내지 않는다', async () => {
    setupPatchMocks()
    const res = await PATCH(makeRequest({ title: mockExisting.title }), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })

  it('변경사항 있으면 204를 반환하고 알림을 보낸다', async () => {
    setupPatchMocks()
    mockSendEventNotification.mockResolvedValue(undefined)
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updated' })
    )
  })

  it('reminderMinutes가 있으면 event_reminders를 교체한다', async () => {
    setupPatchMocks()
    // event_reminders delete
    const reminderDelete = jest.fn().mockReturnThis()
    const reminderDeleteEq = jest.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementationOnce(() => ({
      delete: reminderDelete,
      eq: reminderDeleteEq,
    }))
    // event_reminders insert
    const reminderInsert = jest.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementationOnce(() => ({ insert: reminderInsert }))

    mockSendEventNotification.mockResolvedValue(undefined)

    await PATCH(makeRequest({ reminderMinutes: [30] }), makeParams())
    expect(mockFrom).toHaveBeenCalledWith('event_reminders')
    expect(reminderInsert).toHaveBeenCalled()
  })
})
