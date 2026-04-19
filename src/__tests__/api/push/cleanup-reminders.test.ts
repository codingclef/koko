/**
 * @jest-environment node
 */
import { POST } from '@/app/api/cron/cleanup-reminders/route'
import { NextRequest } from 'next/server'

let mockRpcResult: { data: unknown; error: unknown } = { data: 0, error: null }

const mockRpc: jest.Mock = jest.fn(() => Promise.resolve(mockRpcResult))

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => mockRpc(...args) },
}))

function makeRequest(body: string = '{}', secret = 'test-secret') {
  return new NextRequest('http://localhost/api/cron/cleanup-reminders', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.CRON_SECRET = 'test-secret'
  mockRpcResult = { data: 0, error: null }
})

describe('POST /api/cron/cleanup-reminders', () => {
  it('CRON_SECRET 불일치 시 401을 반환한다', async () => {
    const res = await POST(makeRequest('{}', 'wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('기본 30일 보존 기간으로 cleanup RPC를 호출한다', async () => {
    mockRpcResult = { data: 12, error: null }

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ deleted: 12, retentionDays: 30 })
    expect(mockRpc).toHaveBeenCalledWith('cleanup_sent_event_reminders', {
      p_retention_days: 30,
    })
  })

  it('유효한 retentionDays를 전달하면 해당 값으로 cleanup한다', async () => {
    mockRpcResult = { data: 3, error: null }

    const res = await POST(makeRequest(JSON.stringify({ retentionDays: 45 })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ deleted: 3, retentionDays: 45 })
    expect(mockRpc).toHaveBeenCalledWith('cleanup_sent_event_reminders', {
      p_retention_days: 45,
    })
  })

  it('음수 retentionDays는 400을 반환하고 cleanup을 호출하지 않는다', async () => {
    const res = await POST(makeRequest(JSON.stringify({ retentionDays: -1 })))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('잘못된 JSON body는 400을 반환한다', async () => {
    const res = await POST(makeRequest('{'))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('RPC 에러 시 500을 반환한다', async () => {
    mockRpcResult = { data: null, error: { message: 'rpc error' } }

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
  })
})
