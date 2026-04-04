import { renderHook } from '@testing-library/react'
import { useHolidays, clearHolidayCache } from '@/hooks/useHolidays'

beforeEach(() => {
  clearHolidayCache()
})

describe('useHolidays', () => {
  it('countryCodes가 빈 배열이면 빈 배열을 반환한다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, []))
    expect(result.current).toEqual([])
  })

  it('지정한 월의 공휴일만 반환한다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR'])) // month=2 → March
    expect(result.current.every((h) => h.date.startsWith('2026-03'))).toBe(true)
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

  it('복수 국가의 공휴일을 합쳐서 반환하고 countryCode가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, ['KR', 'JP'])) // March
    const codes = result.current.map((h) => h.countryCode)
    expect(codes).toContain('KR')
  })
})
