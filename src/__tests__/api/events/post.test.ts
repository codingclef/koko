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

const mockGetClaims = jest.fn()
const mockRpc = jest.fn()

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getClaims: (token: unknown) => mockGetClaims(token) },
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

  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
  mockRpc.mockResolvedValue({ data: [CREATED_EVENT], error: null })
})

describe('POST /api/events', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('unauthorized') })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(401)
  })

  it('title 누락 시 400을 반환한다', async () => {
    const res = await POST(makeRequest({ ...baseBody, title: '' }))
    expect(res.status).toBe(400)
  })

  it('가족 미소속이면 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no_family' } })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('캘린더 접근 불가이면 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
  })

  it('이벤트를 생성하고 201을 반환한다', async () => {
    mockSendEventNotification.mockResolvedValue(undefined)
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(201)
    const json = await res.json() as { id: string }
    expect(json.id).toBe('evt-1')
  })

  it('create_event_authorized RPC를 호출한다', async () => {
    await POST(makeRequest({ ...baseBody, reminderMinutes: [30, 60] }))
    expect(mockRpc).toHaveBeenCalledWith(
      'create_event_authorized',
      expect.objectContaining({ p_reminder_minutes: [30, 60] })
    )
  })

  it('calendarId가 null이면 p_calendar_id를 null로 전달한다', async () => {
    mockSendEventNotification.mockResolvedValue(undefined)
    const res = await POST(makeRequest({ ...baseBody, calendarId: null }))
    expect(res.status).toBe(201)
    expect(mockRpc).toHaveBeenCalledWith(
      'create_event_authorized',
      expect.objectContaining({ p_calendar_id: null })
    )
  })

  it('RPC 실패 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(500)
  })
})
