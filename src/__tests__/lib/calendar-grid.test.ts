import { buildCalendarGrid, getCalendarGridRange } from '@/lib/calendar-grid'

describe('calendar grid range', () => {
  it('5행 월의 전월·다음월 셀을 포함한 반개방 범위를 반환한다', () => {
    const { start, endExclusive } = getCalendarGridRange(2026, 3)

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 2, 29])
    expect([endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate()]).toEqual([2026, 4, 3])
    expect(buildCalendarGrid(2026, 3)).toHaveLength(35)
  })

  it('6행 월의 마지막 주까지 범위에 포함한다', () => {
    const { start, endExclusive } = getCalendarGridRange(2026, 4)

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 3, 26])
    expect([endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate()]).toEqual([2026, 5, 7])
    expect(buildCalendarGrid(2026, 4)).toHaveLength(42)
  })

  it('연도 경계의 인접 월 날짜를 보존한다', () => {
    const { start, endExclusive } = getCalendarGridRange(2026, 0)

    expect(start.getFullYear()).toBe(2025)
    expect(endExclusive.getFullYear()).toBe(2026)
  })
})
