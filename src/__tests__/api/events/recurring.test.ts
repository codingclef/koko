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
import { PATCH, DELETE } from '@/app/api/events/[id]/route'
import { NextRequest } from 'next/server'

const mockSendEventNotification = jest.fn()
jest.mock('@/lib/push-utils', () => ({
  sendEventNotification: (...args: unknown[]) => mockSendEventNotification(...args),
}))

const mockGetClaims = jest.fn()
const mockRpc = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getClaims: (token: unknown) => mockGetClaims(token) },
    rpc: (fn: unknown, args: unknown) => mockRpc(fn, args),
    from: (table: unknown) => mockFrom(table),
  },
}))

const ACTOR_USER_ID = 'actor-user'
const FAMILY_ID     = 'fam-1'
const SERIES_ID     = 'series-1'
const EVENT_ID      = 'evt-1'

function makeRequest(method: string, url: string, body?: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
  mockSendEventNotification.mockResolvedValue(undefined)
})

// ── POST: recurring ──────────────────────────────────────────

describe('POST /api/events (recurring)', () => {
  const recurringBody = {
    calendarId: null,
    title: '주간 회의',
    description: null,
    startAt: '2026-04-17T09:00:00.000Z',
    endAt: '2026-04-17T10:00:00.000Z',
    isAllDay: false,
    reminderMinutes: [],
    recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [5] },
  }

  beforeEach(() => {
    // from().select().eq().order().limit().single() chain
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: () => Promise.resolve({ data: { family_id: FAMILY_ID, calendar_id: null }, error: null }),
            }),
          }),
        }),
      }),
    })
  })

  it('create_recurring_series_authorized RPC를 호출한다', async () => {
    mockRpc.mockResolvedValue({ data: [{ series_id: SERIES_ID, event_count: 52 }], error: null })
    const res = await POST(makeRequest('POST', 'http://localhost/api/events', recurringBody))
    expect(res.status).toBe(201)
    expect(mockRpc).toHaveBeenCalledWith(
      'create_recurring_series_authorized',
      expect.objectContaining({
        p_actor_user_id: ACTOR_USER_ID,
        p_freq: 'weekly',
        p_interval: 1,
        p_days_of_week: [5],
      })
    )
  })

  it('RPC 결과로 seriesId와 eventCount를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: [{ series_id: SERIES_ID, event_count: 52 }], error: null })
    const res = await POST(makeRequest('POST', 'http://localhost/api/events', recurringBody))
    const json = await res.json() as { seriesId: string; eventCount: number }
    expect(json.seriesId).toBe(SERIES_ID)
    expect(json.eventCount).toBe(52)
  })

  it('no_family 에러는 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no_family' } })
    const res = await POST(makeRequest('POST', 'http://localhost/api/events', recurringBody))
    expect(res.status).toBe(403)
  })

  it('recurrence 없으면 create_event_authorized RPC를 사용한다', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: EVENT_ID, family_id: FAMILY_ID }], error: null })
    const bodyWithoutRecurrence = { ...recurringBody, recurrence: undefined }
    await POST(makeRequest('POST', 'http://localhost/api/events', bodyWithoutRecurrence))
    expect(mockRpc).toHaveBeenCalledWith('create_event_authorized', expect.anything())
  })
})

// ── PATCH: series scope ───────────────────────────────────────

describe('PATCH /api/events/[id] (series scope)', () => {
  it('scope=following이면 update_series_authorized를 호출한다', async () => {
    mockRpc.mockResolvedValue({
      data: { is_changed: true, family_id: FAMILY_ID, new_calendar_id: null, new_title: '회의', new_start_at: '2026-04-17T09:00:00Z', series_id: SERIES_ID },
      error: null,
    })
    const body = {
      title: '회의',
      scope: 'following',
      anchorOccurrenceDate: '2026-04-17',
      localStartDate: '2026-04-17',
      localEndDate: '2026-04-17',
    }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'update_series_authorized',
      expect.objectContaining({ p_scope: 'following', p_anchor_occurrence_date: '2026-04-17' })
    )
  })

  it('scope=single이면 update_series_authorized를 호출한다', async () => {
    mockRpc.mockResolvedValue({
      data: { is_changed: true, family_id: FAMILY_ID, new_calendar_id: null, new_title: '회의', new_start_at: '2026-04-18T09:00:00Z', series_id: SERIES_ID },
      error: null,
    })
    const body = {
      title: '회의',
      scope: 'single',
      anchorOccurrenceDate: '2026-04-17',
      startAt: '2026-04-18T09:00:00.000Z',
      endAt: '2026-04-18T10:00:00.000Z',
    }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'update_series_authorized',
      expect.objectContaining({
        p_scope: 'single',
        p_start_at: '2026-04-18T09:00:00.000Z',
        p_end_at: '2026-04-18T10:00:00.000Z',
      })
    )
  })

  it('scope=all이면 update_series_authorized를 호출한다', async () => {
    mockRpc.mockResolvedValue({
      data: { is_changed: true, family_id: FAMILY_ID, new_calendar_id: null, new_title: '전체 회의', new_start_at: '2026-04-17T11:00:00Z', series_id: SERIES_ID },
      error: null,
    })
    const body = {
      title: '전체 회의',
      scope: 'all',
      anchorOccurrenceDate: '2026-04-17',
      localStartDate: '2026-04-17',
      localEndDate: '2026-04-17',
      startTime: '11:00:00',
      endTime: '12:00:00',
    }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'update_series_authorized',
      expect.objectContaining({
        p_scope: 'all',
        p_anchor_occurrence_date: '2026-04-17',
        p_start_time: '11:00:00',
        p_end_time: '12:00:00',
      })
    )
  })

  it('scope=following인 종일 일정은 localStartDate 기준으로 날짜 유지 여부를 판단한다', async () => {
    mockRpc.mockResolvedValue({
      data: { is_changed: true, family_id: FAMILY_ID, new_calendar_id: null, new_title: '회의', new_start_at: '2026-04-17T00:00:00Z', series_id: SERIES_ID },
      error: null,
    })
    const body = {
      title: '회의',
      scope: 'following',
      anchorOccurrenceDate: '2026-04-17',
      localStartDate: '2026-04-17',
      localEndDate: '2026-04-17',
      startAt: '2026-04-16T15:00:00.000Z',
      endAt: '2026-04-16T15:00:00.000Z',
      isAllDay: true,
    }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'update_series_authorized',
      expect.objectContaining({
        p_scope: 'following',
        p_start_time: '15:00:00',
        p_end_time: '15:00:00',
      })
    )
  })

  it('following scope에서 날짜 이동을 요청하면 400을 반환한다', async () => {
    const body = {
      title: '회의',
      scope: 'following',
      anchorOccurrenceDate: '2026-04-17',
      localStartDate: '2026-04-18',
      startAt: '2026-04-18T09:00:00.000Z',
    }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('scope 없으면 update_event_authorized를 사용한다', async () => {
    mockRpc.mockResolvedValue({
      data: { is_changed: false, family_id: FAMILY_ID, new_calendar_id: null, new_title: '회의', new_start_at: '2026-04-17T09:00:00Z' },
      error: null,
    })
    const body = { title: '회의' }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith('update_event_authorized', expect.anything())
  })

  it('not_found는 404를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_found' } })
    const body = { title: '회의', scope: 'following', anchorOccurrenceDate: '2026-04-17' }
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/events/${EVENT_ID}`, body),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(404)
  })
})

// ── DELETE: series scope ──────────────────────────────────────

describe('DELETE /api/events/[id] (series scope)', () => {
  const seriesDeleteResult = {
    family_id: FAMILY_ID, calendar_id: null, title: '주간 회의',
    start_at: '2026-04-17T09:00:00Z', series_id: SERIES_ID, scope: 'following',
  }

  it('scope=all이면 delete_series_authorized를 호출한다', async () => {
    mockRpc.mockResolvedValue({ data: seriesDeleteResult, error: null })
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/events/${EVENT_ID}?scope=all`),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'delete_series_authorized',
      expect.objectContaining({ p_scope: 'all', p_event_id: EVENT_ID })
    )
  })

  it('scope=single이면 delete_series_authorized(single)을 호출한다', async () => {
    mockRpc.mockResolvedValue({ data: { ...seriesDeleteResult, scope: 'single' }, error: null })
    // need from() for single scope pre-fetch
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: EVENT_ID, family_id: FAMILY_ID, calendar_id: null, title: '회의', start_at: '2026-04-17T09:00:00Z', series_id: SERIES_ID, created_by: ACTOR_USER_ID },
            error: null,
          }),
        }),
      }),
    })
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/events/${EVENT_ID}?scope=single`),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'delete_series_authorized',
      expect.objectContaining({ p_scope: 'single' })
    )
  })

  it('scope=following이면 delete_series_authorized(following)을 호출한다', async () => {
    mockRpc.mockResolvedValue({ data: { ...seriesDeleteResult, scope: 'following' }, error: null })
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/events/${EVENT_ID}?scope=following&anchorOccurrenceDate=2026-04-24`),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith(
      'delete_series_authorized',
      expect.objectContaining({
        p_scope: 'following',
        p_anchor_occurrence_date: '2026-04-24',
      })
    )
  })

  it('scope 없으면 delete_event_authorized (hard delete)를 사용한다', async () => {
    mockRpc.mockResolvedValue({
      data: { family_id: FAMILY_ID, calendar_id: null, title: '회의', start_at: '2026-04-17T09:00:00Z' },
      error: null,
    })
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/events/${EVENT_ID}`),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(204)
    expect(mockRpc).toHaveBeenCalledWith('delete_event_authorized', expect.anything())
  })

  it('forbidden은 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/events/${EVENT_ID}?scope=all`),
      makeParams(EVENT_ID)
    )
    expect(res.status).toBe(403)
  })
})
