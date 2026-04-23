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

import { DELETE } from '@/app/api/events/[id]/route'
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

const deletedResult = {
  family_id: FAMILY_ID,
  calendar_id: CALENDAR_ID,
  title: '생일 파티',
  start_at: '2026-04-15T09:00:00.000Z',
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

  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
  mockRpc.mockResolvedValue({ data: deletedResult, error: null })
  mockFrom.mockReturnValue(makeAllowedEmailChain())
})

describe('DELETE /api/events/[id]', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('unauthorized') })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('이벤트가 없으면 404를 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_found' } })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it('접근 불가이면 403을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it('이벤트를 삭제하고 204를 반환하며 알림을 보낸다', async () => {
    mockSendEventNotification.mockResolvedValue(undefined)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', eventTitle: '생일 파티' })
    )
  })

  it('RPC 실패 시 500을 반환한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(500)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })
})
