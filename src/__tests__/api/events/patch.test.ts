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

import { PATCH } from '@/app/api/events/[id]/route'
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
const EVENT_ID = 'evt-1'
const FAMILY_ID = 'fam-1'
const CALENDAR_ID = 'cal-1'

const baseResult = {
  is_changed: false,
  family_id: FAMILY_ID,
  new_calendar_id: CALENDAR_ID,
  new_title: '기존 제목',
  new_start_at: '2026-04-15T09:00:00.000Z',
}

function makeAllowedEmailChain() {
  const p = Promise.resolve({ data: { app_role: 'member' }, error: null })
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnValue(p),
  }
  return chain
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

  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
  mockRpc.mockResolvedValue({ data: baseResult, error: null })
  mockFrom.mockReturnValue(makeAllowedEmailChain())
})

describe('PATCH /api/events/[id]', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('unauthorized') })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('이벤트가 없으면 404를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_found' } })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(404)
  })

  it('접근 불가이면 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(403)
  })

  it('변경사항 없으면 204를 반환하고 알림을 보내지 않는다', async () => {
    const res = await PATCH(makeRequest({ title: '기존 제목' }), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })

  it('labelColor만 변경하면 RPC 결과에 따라 알림을 보내지 않는다', async () => {
    const res = await PATCH(makeRequest({ labelColor: '#10b981' }), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })

  it('변경사항 있으면 204를 반환하고 알림을 보낸다', async () => {
    mockRpc.mockResolvedValue({ data: { ...baseResult, is_changed: true, new_title: '새 제목' }, error: null })
    mockSendEventNotification.mockResolvedValue(undefined)
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updated' })
    )
  })

  it('update_event_authorized RPC를 호출한다', async () => {
    await PATCH(makeRequest({ reminderMinutes: [30] }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'update_event_authorized',
      expect.objectContaining({ p_reminder_minutes: [30] })
    )
  })

  it('reminderMinutes 미제공 시 p_reminder_minutes를 null로 전달한다', async () => {
    await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'update_event_authorized',
      expect.objectContaining({ p_reminder_minutes: null })
    )
  })

  it('RPC 실패 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const res = await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(res.status).toBe(500)
  })

  it('허용된 labelColor가 있으면 p_label_color를 RPC에 전달한다', async () => {
    await PATCH(makeRequest({ labelColor: '#10b981' }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'update_event_authorized',
      expect.objectContaining({ p_label_color: '#10b981', p_has_label_color: true })
    )
  })

  it('허용되지 않은 labelColor면 400을 반환한다', async () => {
    const res = await PATCH(makeRequest({ labelColor: '#badcol' }), makeParams())
    expect(res.status).toBe(400)
  })

  it('labelColor를 명시하지 않으면 p_has_label_color가 false다', async () => {
    await PATCH(makeRequest({ title: '새 제목' }), makeParams())
    expect(mockRpc).toHaveBeenCalledWith(
      'update_event_authorized',
      expect.objectContaining({ p_has_label_color: false })
    )
  })
})
