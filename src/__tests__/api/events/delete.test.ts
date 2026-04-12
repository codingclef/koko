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

const mockExisting = {
  id: EVENT_ID,
  title: '생일 파티',
  start_at: '2026-04-15T09:00:00.000Z',
  calendar_id: 'cal-1',
  family_id: FAMILY_ID,
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

  mockGetUser.mockResolvedValue({
    data: { user: { id: ACTOR_USER_ID, email: 'actor@test.com' } },
    error: null,
  })
})

describe('DELETE /api/events/[id]', () => {
  it('인증 토큰 없으면 401을 반환한다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('unauthorized') })
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('이벤트가 없으면 404를 반환한다', async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }))
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it('가족 미소속이면 403을 반환한다', async () => {
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockExisting }),
    }))
    // family_members 검증 실패
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }))
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(403)
  })

  it('이벤트를 삭제하고 204를 반환하며 알림을 보낸다', async () => {
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockExisting }),
    }))
    // family_members 검증
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
    }))
    // events delete
    mockFrom.mockImplementationOnce(() => ({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    }))

    mockSendEventNotification.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(mockSendEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', eventTitle: '생일 파티' })
    )
  })

  it('삭제 실패 시 500을 반환한다', async () => {
    // events 조회
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockExisting }),
    }))
    // family_members 검증
    mockFrom.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: ACTOR_USER_ID } }),
    }))
    // events delete 실패
    mockFrom.mockImplementationOnce(() => ({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    }))

    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(500)
    expect(mockSendEventNotification).not.toHaveBeenCalled()
  })
})
