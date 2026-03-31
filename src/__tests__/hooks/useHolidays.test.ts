import { renderHook, waitFor } from '@testing-library/react'
import { useHolidays, clearHolidayCache } from '@/hooks/useHolidays'

const mockKrHolidays = [
  { date: '2026-03-01', localName: '삼일절', name: 'Independence Movement Day', countryCode: 'KR', types: ['Public'] },
  { date: '2026-05-05', localName: '어린이날', name: "Children's Day", countryCode: 'KR', types: ['Public'] },
]

const mockJpHolidays = [
  { date: '2026-03-20', localName: '春分の日', name: 'Vernal Equinox Day', countryCode: 'JP', types: ['Public'] },
]

beforeEach(() => {
  jest.clearAllMocks()
  clearHolidayCache()
  global.fetch = jest.fn()
})

describe('useHolidays', () => {
  it('countryCodes가 빈 배열이면 fetch하지 않고 빈 배열을 반환한다', async () => {
    const { result } = renderHook(() => useHolidays(2026, 2, []))
    expect(result.current).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('지정한 월의 공휴일만 필터링하여 반환한다', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockKrHolidays,
    })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR'])) // month=2 → March
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current[0].localName).toBe('삼일절')
  })

  it('복수 국가의 공휴일을 합쳐서 반환한다', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockKrHolidays })
      .mockResolvedValueOnce({ ok: true, json: async () => mockJpHolidays })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR', 'JP'])) // March
    await waitFor(() => expect(result.current).toHaveLength(2))
    const names = result.current.map((h) => h.localName)
    expect(names).toContain('삼일절')
    expect(names).toContain('春分の日')
  })

  it('API 응답이 ok가 아니면 빈 배열을 반환한다', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
    await waitFor(() => {
      // fetch가 호출됐음을 확인 후 결과 확인
      expect(global.fetch).toHaveBeenCalled()
    })
    expect(result.current).toEqual([])
  })

  it('fetch 실패 시 빈 배열을 유지한다', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})
