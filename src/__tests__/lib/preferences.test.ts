import { getUserPreferences, upsertUserPreferences } from '@/lib/preferences'

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'upsert', 'eq'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(p)
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

// ── getUserPreferences ─────────────────────────────────────

describe('getUserPreferences', () => {
  it('저장된 설정이 있으면 반환한다', async () => {
    const mockData = {
      user_id: 'user-1',
      holiday_countries: ['KR', 'JP'],
      app_theme: 'tangerine',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getUserPreferences('user-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('user_preferences')
  })

  it('행이 없으면 (PGRST116) null을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { code: 'PGRST116' } }))
    const result = await getUserPreferences('user-1')
    expect(result).toBeNull()
  })

  it('PGRST116 외 에러는 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { code: 'OTHER', message: 'DB error' } }))
    await expect(getUserPreferences('user-1')).rejects.toEqual({ code: 'OTHER', message: 'DB error' })
  })
})

// ── upsertUserPreferences ──────────────────────────────────

describe('upsertUserPreferences', () => {
  it('upsert 후 저장된 데이터를 반환한다', async () => {
    const mockData = {
      user_id: 'user-1',
      holiday_countries: ['KR'],
      app_theme: 'tangerine',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await upsertUserPreferences('user-1', { holiday_countries: ['KR'] })
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('user_preferences')
  })

  it('app_theme을 저장하고 반환한다', async () => {
    const mockData = {
      user_id: 'user-1',
      holiday_countries: [],
      app_theme: 'ocean',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await upsertUserPreferences('user-1', { app_theme: 'ocean' })
    expect(result.app_theme).toBe('ocean')
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'upsert failed' } }))
    await expect(
      upsertUserPreferences('user-1', { holiday_countries: ['KR'] })
    ).rejects.toEqual({ message: 'upsert failed' })
  })
})
