import { getFamilyInviteCode, getMyFamilyMember, updateMyDisplayName } from '@/lib/family'

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'update', 'eq'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(p)
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  ;(chain as { finally: unknown }).finally = p.finally.bind(p)
  return chain
}

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
})

// ── getMyFamilyMember ─────────────────────────────────────

describe('getMyFamilyMember', () => {
  it('내 family_member 레코드를 반환한다', async () => {
    const mockData = { id: 'fm-1', user_id: 'user-1', display_name: '홍길동', role: 'member' }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getMyFamilyMember('user-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('family_members')
  })

  it('레코드가 없으면 null을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getMyFamilyMember('user-1')
    expect(result).toBeNull()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getMyFamilyMember('user-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

describe('getFamilyInviteCode', () => {
  it('가족 초대 코드를 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { invite_code: 'ABC123' }, error: null }))
    const result = await getFamilyInviteCode('family-1')
    expect(result).toBe('ABC123')
    expect(mockFrom).toHaveBeenCalledWith('families')
  })

  it('invite_code가 없으면 null을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { invite_code: null }, error: null }))
    const result = await getFamilyInviteCode('family-1')
    expect(result).toBeNull()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getFamilyInviteCode('family-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

// ── updateMyDisplayName ───────────────────────────────────

describe('updateMyDisplayName', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(updateMyDisplayName('user-1', '새이름')).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('family_members')
  })

  it('앞뒤 공백을 제거하고 저장한다', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    await updateMyDisplayName('user-1', '  홍길동  ')
    expect(chain.update).toHaveBeenCalledWith({ display_name: '홍길동' })
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(updateMyDisplayName('user-1', '이름')).rejects.toEqual({ message: 'update error' })
  })
})
