import {
  getUserCalendarPreferences,
  upsertUserCalendarLabelColor,
} from '@/lib/calendar-label-preferences'

function makeChain(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'upsert', 'eq'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(promise)
  ;(chain as { then: unknown }).then = promise.then.bind(promise)
  ;(chain as { catch: unknown }).catch = promise.catch.bind(promise)
  ;(chain as { finally: unknown }).finally = promise.finally.bind(promise)
  return chain
}

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
})

describe('getUserCalendarPreferences', () => {
  it('사용자의 캘린더별 색상 설정을 반환한다', async () => {
    const rows = [
      {
        user_id: 'user-1',
        calendar_id: 'cal-1',
        last_label_color: '#3b82f6',
        created_at: '',
        updated_at: '',
      },
    ]
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }))

    await expect(getUserCalendarPreferences('user-1')).resolves.toEqual(rows)
    expect(mockFrom).toHaveBeenCalledWith('user_calendar_preferences')
  })

  it('조회 실패를 전달한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch failed' } }))

    await expect(getUserCalendarPreferences('user-1')).rejects.toEqual({
      message: 'fetch failed',
    })
  })
})

describe('upsertUserCalendarLabelColor', () => {
  it('null을 포함한 캘린더별 마지막 선택을 upsert한다', async () => {
    const row = {
      user_id: 'user-1',
      calendar_id: 'cal-1',
      last_label_color: null,
      created_at: '',
      updated_at: '',
    }
    const chain = makeChain({ data: row, error: null })
    mockFrom.mockReturnValue(chain)

    await expect(
      upsertUserCalendarLabelColor('user-1', 'cal-1', null)
    ).resolves.toEqual(row)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        calendar_id: 'cal-1',
        last_label_color: null,
      }),
      { onConflict: 'user_id,calendar_id' }
    )
  })

  it('저장 실패를 전달한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'save failed' } }))

    await expect(
      upsertUserCalendarLabelColor('user-1', 'cal-1', '#3b82f6')
    ).rejects.toEqual({ message: 'save failed' })
  })
})
