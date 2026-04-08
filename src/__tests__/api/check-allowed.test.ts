/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/check-allowed/route'
import { NextRequest } from 'next/server'

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'eq', 'ilike'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  return chain
}

const mockFrom = jest.fn()
const mockRpc = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/auth/check-allowed', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('POST /api/auth/check-allowed', () => {
  it('email이 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('email is required')
  })

  it('allowed_emails에 이메일이 있으면 allowed: true, needsOnboarding: false를 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { email: 'test@example.com' }, error: null }))
    const res = await POST(makeRequest({ email: 'test@example.com' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allowed).toBe(true)
    expect(body.needsOnboarding).toBe(false)
  })

  it('allowed_emails에 없고 inviteCode도 없으면 allowed: false를 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const res = await POST(makeRequest({ email: 'unknown@example.com' }))
    const body = await res.json()
    expect(body.allowed).toBe(false)
  })

  it('유효한 inviteCode로 요청 시 allowed_emails에 추가하고 needsOnboarding: false를 반환한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))            // allowed_emails select
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-1' }, error: null })) // families select
      .mockReturnValueOnce(makeChain({ data: null, error: null }))             // allowed_emails insert

    const res = await POST(makeRequest({ email: 'new@example.com', inviteCode: 'ABC123' }))
    const body = await res.json()
    expect(body.allowed).toBe(true)
    expect(body.needsOnboarding).toBe(false)
  })

  it('잘못된 inviteCode이면 allowed: false를 반환한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // allowed_emails select
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // families select → null

    const res = await POST(makeRequest({ email: 'new@example.com', inviteCode: 'INVALID' }))
    const body = await res.json()
    expect(body.allowed).toBe(false)
  })

  it('유효한 appInviteCode로 요청 시 consume_app_invite RPC를 호출하고 needsOnboarding: true를 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null })) // allowed_emails select
    mockRpc.mockResolvedValue({ data: true, error: null })

    const res = await POST(makeRequest({ email: 'new@example.com', appInviteCode: 'ABCD1234' }))
    const body = await res.json()
    expect(body.allowed).toBe(true)
    expect(body.needsOnboarding).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('consume_app_invite', {
      p_code: 'ABCD1234',
      p_email: 'new@example.com',
    })
  })

  it('이미 사용되었거나 만료된 appInviteCode이면 RPC가 false를 반환하고 allowed: false가 된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null })) // allowed_emails select
    mockRpc.mockResolvedValue({ data: false, error: null })

    const res = await POST(makeRequest({ email: 'new@example.com', appInviteCode: 'EXPIRED1' }))
    const body = await res.json()
    expect(body.allowed).toBe(false)
  })

  it('consume_app_invite RPC 에러 시 500을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null })) // allowed_emails select
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const res = await POST(makeRequest({ email: 'new@example.com', appInviteCode: 'ABCD1234' }))
    expect(res.status).toBe(500)
  })

  it('DB 에러 발생 시 500을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    const res = await POST(makeRequest({ email: 'test@example.com' }))
    expect(res.status).toBe(500)
  })

  it('이메일이 소문자로 정규화된다', async () => {
    const chain = makeChain({ data: { email: 'test@example.com' }, error: null })
    mockFrom.mockReturnValue(chain)
    await POST(makeRequest({ email: 'TEST@EXAMPLE.COM' }))
    expect((chain.eq as jest.Mock)).toHaveBeenCalledWith('email', 'test@example.com')
  })
})
