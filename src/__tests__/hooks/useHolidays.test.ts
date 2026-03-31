import { renderHook, waitFor } from '@testing-library/react'
import { useHolidays, clearHolidayCache } from '@/hooks/useHolidays'

// 2026-03-01(삼일절)은 일요일 → 2026-03-02가 대체공휴일
const mockKrHolidays = [
  { date: '2026-03-01', localName: '삼일절', name: 'Independence Movement Day', countryCode: 'KR', types: ['Public'] },
  { date: '2026-05-05', localName: '어린이날', name: "Children's Day", countryCode: 'KR', types: ['Public'] },
]

// 2026-03-20(春分の日)은 금요일 → 대체공휴일 없음
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

    // 2026-03-01(삼일절, 일요일) + 2026-03-02(대체공휴일) = 2건
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR'])) // month=2 → March
    await waitFor(() => expect(result.current).toHaveLength(2))
    const names = result.current.map((h) => h.localName)
    expect(names).toContain('삼일절')
    expect(names).toContain('대체공휴일')
  })

  it('공휴일이 일요일이면 대체공휴일을 다음 평일에 추가한다', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockKrHolidays,
    })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
    await waitFor(() => expect(result.current).toHaveLength(2))

    const substitute = result.current.find((h) => h.localName === '대체공휴일')
    expect(substitute?.date).toBe('2026-03-02') // 삼일절(일요일) 다음 월요일
    expect(substitute?.countryCode).toBe('KR')
  })

  it('일본 공휴일이 일요일이면 振替休日를 추가한다', async () => {
    const sundayJpHoliday = [
      { date: '2026-01-01', localName: '元日', name: "New Year's Day", countryCode: 'JP', types: ['Public'] },
    ]
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => sundayJpHoliday,
    })

    // 2026-01-01이 목요일이면 대체 없음, 하지만 테스트용 날짜 조정
    // 2026-03-01(일요일)에 해당하는 JP 케이스를 만들어 테스트
    const jpSundayHoliday = [
      { date: '2026-03-01', localName: '元日', name: "Test Holiday", countryCode: 'JP', types: ['Public'] },
    ]
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => jpSundayHoliday,
    })

    const { result } = renderHook(() => useHolidays(2026, 2, ['JP']))
    await waitFor(() => expect(result.current).toHaveLength(2))

    const substitute = result.current.find((h) => h.localName === '振替休日')
    expect(substitute?.date).toBe('2026-03-02')
    expect(substitute?.countryCode).toBe('JP')
  })

  it('복수 국가의 공휴일을 합쳐서 반환한다', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockKrHolidays })
      .mockResolvedValueOnce({ ok: true, json: async () => mockJpHolidays })

    // KR: 삼일절 + 대체공휴일(2건), JP: 春分の日(1건) → 총 3건
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR', 'JP'])) // March
    await waitFor(() => expect(result.current).toHaveLength(3))
    const names = result.current.map((h) => h.localName)
    expect(names).toContain('삼일절')
    expect(names).toContain('대체공휴일')
    expect(names).toContain('春分の日')
  })

  it('API 응답이 ok가 아니면 빈 배열을 반환한다', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
    await waitFor(() => {
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
