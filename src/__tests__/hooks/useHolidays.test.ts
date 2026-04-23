import { renderHook, waitFor } from '@testing-library/react'
import { useHolidays, clearHolidayCache } from '@/hooks/useHolidays'
import { getJsonWithAuth } from '@/lib/api-client'

jest.mock('@/lib/api-client', () => ({
  getJsonWithAuth: jest.fn(),
}))

const mockGetJsonWithAuth = getJsonWithAuth as jest.MockedFunction<typeof getJsonWithAuth>

beforeEach(() => {
  clearHolidayCache()
  jest.restoreAllMocks()
  mockGetJsonWithAuth.mockRejectedValue(new Error('network unavailable'))
})

describe('useHolidays', () => {
  it('countryCodes가 빈 배열이면 빈 배열을 반환한다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, []))
    expect(result.current).toEqual([])
  })

  it('현재 월 공휴일을 포함해 반환한다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR'])) // month=2 → March
    const march = result.current.filter((h) => h.date.startsWith('2026-03'))
    expect(march.length).toBeGreaterThan(0)
  })

  describe('KR 대체공휴일', () => {
    it('3·1절(2026-03-01 일요일)의 대체공휴일이 2026-03-02에 추가된다', () => {
      const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
      const dates = result.current.map((h) => h.date)
      expect(dates).toContain('2026-03-01') // 3·1절
      expect(dates).toContain('2026-03-02') // 대체공휴일
    })

    it('2026-03-02의 localName이 대체공휴일이다', () => {
      const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))
      const substitute = result.current.find((h) => h.date === '2026-03-02')
      expect(substitute?.localName).toBe('대체공휴일')
    })
  })

  describe('JP Golden Week 2026 — 연속 휴일 대체공휴일', () => {
    // 2026/5/3(일) 憲法記念日 → 5/4 みどりの日, 5/5 こどもの日 모두 휴일
    // → 振替休日는 연속 휴일을 건너뛴 5/6(수)에 있어야 함

    it('5/3 憲法記念日, 5/4 みどりの日, 5/5 こどもの日, 5/6 振替休日를 모두 포함한다', () => {
      const { result } = renderHook(() => useHolidays(2026, 4, ['JP'])) // month=4 → May
      const dates = result.current.map((h) => h.date)
      expect(dates).toContain('2026-05-03') // 憲法記念日
      expect(dates).toContain('2026-05-04') // みどりの日
      expect(dates).toContain('2026-05-05') // こどもの日
      expect(dates).toContain('2026-05-06') // 振替休日
    })

    it('5/3의 localName이 憲法記念日다', () => {
      const { result } = renderHook(() => useHolidays(2026, 4, ['JP']))
      const kenpo = result.current.find((h) => h.date === '2026-05-03')
      expect(kenpo?.localName).toBe('憲法記念日')
    })

    it('5/6의 localName이 振替休日다 (원본 휴일명 포함 형식 아님)', () => {
      const { result } = renderHook(() => useHolidays(2026, 4, ['JP']))
      const substitute = result.current.find((h) => h.date === '2026-05-06')
      expect(substitute?.localName).toBe('振替休日')
    })

    it('5/4와 5/5 사이에 振替休日가 없다 (연속 휴일을 올바르게 건너뜀)', () => {
      const { result } = renderHook(() => useHolidays(2026, 4, ['JP']))
      const may4 = result.current.find((h) => h.date === '2026-05-04')
      const may5 = result.current.find((h) => h.date === '2026-05-05')
      expect(may4?.localName).not.toBe('振替休日')
      expect(may5?.localName).not.toBe('振替休日')
    })
  })

  describe('인접 월 휴일 포함 — 그리드 범위 대응', () => {
    it('5월 뷰에서 4/29 昭和の日가 반환된다', () => {
      const { result } = renderHook(() => useHolidays(2026, 4, ['JP'])) // month=4 → May
      const apr29 = result.current.find((h) => h.date === '2026-04-29')
      expect(apr29).toBeDefined()
      expect(apr29?.localName).toBe('昭和の日')
    })

    it('1월 뷰에서 전년 12월 크리스마스(KR)가 반환된다 — 연도 경계', () => {
      const { result } = renderHook(() => useHolidays(2026, 0, ['KR'])) // month=0 → January 2026
      const christmas = result.current.find((h) => h.date === '2025-12-25')
      expect(christmas).toBeDefined()
      expect(christmas?.localName).toBe('크리스마스')
    })

    it('12월 뷰에서 다음 연도 1월 元日(JP)이 반환된다 — 연도 경계', () => {
      const { result } = renderHook(() => useHolidays(2025, 11, ['JP'])) // month=11 → December 2025
      const jan1 = result.current.find((h) => h.date === '2026-01-01')
      expect(jan1).toBeDefined()
    })

    it('현재 월 휴일이 기존과 동일하게 포함된다', () => {
      const { result } = renderHook(() => useHolidays(2026, 2, ['KR'])) // month=2 → March
      const samil = result.current.find((h) => h.date === '2026-03-01')
      expect(samil).toBeDefined()
    })
  })

  it('복수 국가의 공휴일을 합쳐서 반환하고 countryCode가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR', 'JP'])) // March
    const codes = result.current.map((h) => h.countryCode)
    expect(codes).toContain('KR')
  })

  it('API 응답이 오면 KR 휴일을 서버 응답으로 갱신한다', async () => {
    mockGetJsonWithAuth.mockResolvedValue({
      holidays: [
        { date: '2026-05-01', localName: '노동절', countryCode: 'KR' },
        { date: '2026-05-05', localName: '어린이날', countryCode: 'KR' },
      ],
    })

    const { result } = renderHook(() => useHolidays(2026, 4, ['KR']))

    await waitFor(() => {
      expect(result.current.some((h) => h.date === '2026-05-01' && h.localName === '노동절')).toBe(true)
    })
  })
})
