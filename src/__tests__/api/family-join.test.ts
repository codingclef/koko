/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/join/route'
import { NextRequest } from 'next/server'

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'delete', 'eq', 'ilike'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  return chain
}

const mockFrom = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/family/join', {
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

describe('POST /api/family/join', () => {
  it('userId 또는 inviteCode가 없으면 400을 반환한다', async () => {
    const res1 = await POST(makeRequest({ userId: 'user-1' }))
    expect(res1.status).toBe(400)

    const res2 = await POST(makeRequest({ inviteCode: 'ABC123' }))
    expect(res2.status).toBe(400)

    const res3 = await POST(makeRequest({}))
    expect(res3.status).toBe(400)
  })

  it('잘못된 inviteCode이면 404를 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'INVALID' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Invalid invite code')
  })

  it('이미 같은 family 구성원이면 familyId를 반환한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-1' }, error: null }))        // families
      .mockReturnValueOnce(makeChain({ data: { family_id: 'fam-1' }, error: null })) // family_members existing
    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'ABC123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-1')
  })

  it('다른 family 구성원이면 기존 family에서 나가고 새 family에 합류한다', async () => {
    const insertChain = makeChain({ data: null, error: null })
    const deleteChain = makeChain({ data: null, error: null })

    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-2' }, error: null }))          // families
      .mockReturnValueOnce(makeChain({ data: { family_id: 'fam-1' }, error: null }))   // existing member (다른 family)
      .mockReturnValueOnce(deleteChain)                                                  // delete from old family
      .mockReturnValueOnce(insertChain)                                                  // insert into new family

    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'XYZ' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyId).toBe('fam-2')
  })

  it('family_members insert 에러 발생 시 500을 반환한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-1' }, error: null })) // families
      .mockReturnValueOnce(makeChain({ data: null, error: null }))             // no existing member
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'insert error' } })) // insert fails

    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'ABC123' }))
    expect(res.status).toBe(500)
  })

  it('displayName이 제공되면 해당 이름으로 합류한다', async () => {
    const insertChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-1' }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(insertChain)

    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'ABC123', displayName: '엄마' }))
    expect(res.status).toBe(200)
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: '엄마' })
    )
  })

  it('displayName이 없으면 Member로 합류한다', async () => {
    const insertChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'fam-1' }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(insertChain)

    const res = await POST(makeRequest({ userId: 'user-1', inviteCode: 'ABC123' }))
    expect(res.status).toBe(200)
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Member' })
    )
  })
})
