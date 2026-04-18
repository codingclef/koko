import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarGrid, isMultiDayAllDay, isEventOnDate, computeSegments } from '@/components/calendar/CalendarGrid'
import type { Calendar, CalendarEvent } from '@/lib/calendar'
import type { Holiday } from '@/hooks/useHolidays'

jest.mock('korean-lunar-calendar', () => {
  return jest.fn().mockImplementation(() => ({
    setSolarDate: jest.fn(),
    getLunarCalendar: jest.fn().mockReturnValue({ month: 4, day: 20 }),
  }))
})

// ── Fixtures ────────────────────────────────────────────────

const calendars: Calendar[] = [
  { id: 'cal-1', family_id: 'fam-1', created_by: 'user-1', name: '가족', color: '#f97316', created_at: '', updated_at: '' },
]

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'evt-1',
    family_id: 'fam-1',
    calendar_id: 'cal-1',
    created_by: 'user-1',
    title: '생일파티',
    description: null,
    start_at: '2025-06-15T10:00:00Z',
    end_at: null,
    is_all_day: false,
    is_cancelled: false,
    label_color: null,
    series_id: null,
    series_occurrence_date: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const singleEvent = makeEvent({})

const defaultProps = {
  year: 2025,
  month: 5, // June (0-indexed)
  events: [singleEvent],
  calendars,
  activeIds: new Set<string>(),
  selectedDate: null,
  onSelectDate: jest.fn(),
}

// ── isMultiDayAllDay ─────────────────────────────────────────

describe('isMultiDayAllDay', () => {
  it('is_all_day=false 이면 false', () => {
    expect(isMultiDayAllDay(makeEvent({ is_all_day: false, end_at: '2025-06-17T00:00:00Z' }))).toBe(false)
  })

  it('end_at=null 이면 false', () => {
    expect(isMultiDayAllDay(makeEvent({ is_all_day: true, end_at: null }))).toBe(false)
  })

  it('start == end (하루 종일) 이면 false', () => {
    expect(isMultiDayAllDay(makeEvent({
      is_all_day: true,
      start_at: '2025-06-15T00:00:00Z',
      end_at: '2025-06-15T00:00:00Z',
    }))).toBe(false)
  })

  it('start < end (여러 날) 이면 true', () => {
    expect(isMultiDayAllDay(makeEvent({
      is_all_day: true,
      start_at: '2025-06-15T00:00:00Z',
      end_at: '2025-06-17T00:00:00Z',
    }))).toBe(true)
  })
})

// ── isEventOnDate ────────────────────────────────────────────

describe('isEventOnDate', () => {
  const target = new Date(2026, 4, 14) // 2026-05-14

  it('단일 종일 일정: start_at 날짜만 매칭된다', () => {
    const evt = makeEvent({
      is_all_day: true,
      start_at: '2026-05-14T00:00:00',
      end_at: '2026-05-14T00:00:00',
    })
    expect(isEventOnDate(evt, target)).toBe(true)
    expect(isEventOnDate(evt, new Date(2026, 4, 15))).toBe(false)
  })

  it('멀티데이 종일: 시작일에 매칭된다', () => {
    const evt = makeEvent({
      is_all_day: true,
      start_at: '2026-05-12T00:00:00',
      end_at: '2026-05-16T00:00:00',
    })
    expect(isEventOnDate(evt, new Date(2026, 4, 12))).toBe(true)
  })

  it('멀티데이 종일: 중간 날짜에 매칭된다', () => {
    const evt = makeEvent({
      is_all_day: true,
      start_at: '2026-05-12T00:00:00',
      end_at: '2026-05-16T00:00:00',
    })
    expect(isEventOnDate(evt, target)).toBe(true) // 5/14
  })

  it('멀티데이 종일: 종료일에 매칭된다', () => {
    const evt = makeEvent({
      is_all_day: true,
      start_at: '2026-05-12T00:00:00',
      end_at: '2026-05-16T00:00:00',
    })
    expect(isEventOnDate(evt, new Date(2026, 4, 16))).toBe(true)
  })

  it('멀티데이 종일: 범위 바깥 날짜는 매칭되지 않는다', () => {
    const evt = makeEvent({
      is_all_day: true,
      start_at: '2026-05-12T00:00:00',
      end_at: '2026-05-16T00:00:00',
    })
    expect(isEventOnDate(evt, new Date(2026, 4, 11))).toBe(false)
    expect(isEventOnDate(evt, new Date(2026, 4, 17))).toBe(false)
  })

  it('비종일 일정: start_at 날짜만 매칭된다', () => {
    const evt = makeEvent({
      is_all_day: false,
      start_at: '2026-05-14T10:00:00',
      end_at: '2026-05-16T11:00:00',
    })
    expect(isEventOnDate(evt, target)).toBe(true)
    expect(isEventOnDate(evt, new Date(2026, 4, 15))).toBe(false)
  })
})

// ── computeSegments ──────────────────────────────────────────

function makeRow(year: number, month: number, startDay: number) {
  // Returns a DayCell row of 7 days starting from startDay (month is 0-indexed)
  return Array.from({ length: 7 }, (_, i) => ({
    date: new Date(year, month, startDay + i),
    isCurrentMonth: true,
  }))
}

describe('computeSegments', () => {
  it('row와 겹치지 않는 이벤트는 제외된다', () => {
    // row: 2025-06-08 (Sun) ~ 2025-06-14 (Sat)
    const row = makeRow(2025, 5, 8)
    const event = makeEvent({
      is_all_day: true,
      start_at: '2025-06-01T00:00:00Z',
      end_at: '2025-06-05T00:00:00Z',
    })
    expect(computeSegments(row, [event])).toHaveLength(0)
  })

  it('이벤트 시작이 row 이전이면 colStart가 0(일)으로 clamp된다', () => {
    // row: 2025-06-08 (Sun) ~ 2025-06-14 (Sat)
    // event: 2025-06-05 ~ 2025-06-10 → seg starts at row[0]=Sun(col0)
    const row = makeRow(2025, 5, 8)
    const event = makeEvent({
      id: 'e1',
      is_all_day: true,
      start_at: '2025-06-05T00:00:00Z',
      end_at: '2025-06-10T00:00:00Z',
    })
    const [seg] = computeSegments(row, [event])
    expect(seg.colStart).toBe(0)
    expect(seg.isStart).toBe(false)
  })

  it('이벤트 끝이 row 이후면 colSpan이 row 끝까지만 계산된다', () => {
    // row: 2025-06-08 (Sun) ~ 2025-06-14 (Sat)
    // event: 2025-06-12 (Thu, col4) ~ 2025-06-20 → seg ends at Sat(col6)
    const row = makeRow(2025, 5, 8)
    const event = makeEvent({
      id: 'e2',
      is_all_day: true,
      start_at: '2025-06-12T00:00:00Z',
      end_at: '2025-06-20T00:00:00Z',
    })
    const [seg] = computeSegments(row, [event])
    expect(seg.colStart).toBe(4) // Thursday
    expect(seg.colSpan).toBe(3)  // Thu(4) ~ Sat(6)
    expect(seg.isEnd).toBe(false)
  })

  it('row 내에 완전히 포함된 이벤트는 isStart/isEnd 모두 true', () => {
    // row: 2025-06-08 (Sun) ~ 2025-06-14 (Sat)
    // event: 2025-06-10 (Tue, col2) ~ 2025-06-12 (Thu, col4)
    const row = makeRow(2025, 5, 8)
    const event = makeEvent({
      id: 'e3',
      is_all_day: true,
      start_at: '2025-06-10T00:00:00Z',
      end_at: '2025-06-12T00:00:00Z',
    })
    const [seg] = computeSegments(row, [event])
    expect(seg.isStart).toBe(true)
    expect(seg.isEnd).toBe(true)
    expect(seg.colStart).toBe(2) // Tuesday
    expect(seg.colSpan).toBe(3) // Tue~Thu
  })

  it('겹치는 이벤트는 다른 lane에 배치된다', () => {
    // row: 2025-06-08 (Sun) ~ 2025-06-14 (Sat)
    // event A: Mon~Wed (col1~3), event B: Tue~Thu (col2~4) → B goes to lane 1
    const row = makeRow(2025, 5, 8)
    const eventA = makeEvent({
      id: 'a',
      is_all_day: true,
      start_at: '2025-06-09T00:00:00Z',
      end_at: '2025-06-11T00:00:00Z',
    })
    const eventB = makeEvent({
      id: 'b',
      is_all_day: true,
      start_at: '2025-06-10T00:00:00Z',
      end_at: '2025-06-12T00:00:00Z',
    })
    const segs = computeSegments(row, [eventA, eventB])
    expect(segs[0].lane).toBe(0)
    expect(segs[1].lane).toBe(1)
  })

  it('겹치지 않는 이벤트는 같은 lane에 배치된다', () => {
    // event A: Mon~Tue (col1~2), event B: Thu~Fri (col4~5) → both lane 0
    const row = makeRow(2025, 5, 8)
    const eventA = makeEvent({
      id: 'a',
      is_all_day: true,
      start_at: '2025-06-09T00:00:00Z',
      end_at: '2025-06-10T00:00:00Z',
    })
    const eventB = makeEvent({
      id: 'b',
      is_all_day: true,
      start_at: '2025-06-12T00:00:00Z',
      end_at: '2025-06-13T00:00:00Z',
    })
    const segs = computeSegments(row, [eventA, eventB])
    expect(segs[0].lane).toBe(0)
    expect(segs[1].lane).toBe(0)
  })

  it('같은 시작일 이벤트는 기간 긴 순 → id 순으로 정렬된다', () => {
    const row = makeRow(2025, 5, 8)
    const shortEvent = makeEvent({
      id: 'z-short',
      is_all_day: true,
      start_at: '2025-06-09T00:00:00Z',
      end_at: '2025-06-10T00:00:00Z',
    })
    const longEvent = makeEvent({
      id: 'a-long',
      is_all_day: true,
      start_at: '2025-06-09T00:00:00Z',
      end_at: '2025-06-12T00:00:00Z',
    })
    const segs = computeSegments(row, [shortEvent, longEvent])
    // 긴 이벤트(a-long)가 먼저
    expect(segs[0].event.id).toBe('a-long')
    expect(segs[1].event.id).toBe('z-short')
  })
})

// ── CalendarGrid 렌더링 ──────────────────────────────────────

describe('CalendarGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('날짜 클릭 시 onSelectDate가 호출된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    const dayCells = screen.getAllByRole('button')
    fireEvent.click(dayCells[0])
    expect(defaultProps.onSelectDate).toHaveBeenCalledTimes(1)
  })

  it('단일 이벤트 pill이 렌더링된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    expect(screen.getByText('생일파티')).toBeInTheDocument()
  })

  it('이벤트 pill은 role=button 없이 렌더링된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    expect(screen.getByText('생일파티')).not.toHaveAttribute('role', 'button')
  })

  it('이벤트 pill 클릭 시 onSelectDate가 호출된다 (날짜 셀과 동일 동작)', () => {
    render(<CalendarGrid {...defaultProps} />)
    fireEvent.click(screen.getByText('생일파티'))
    expect(defaultProps.onSelectDate).toHaveBeenCalledTimes(1)
  })

  it('holidays prop이 있으면 해당 날짜에 공휴일 칩이 렌더링된다', () => {
    const holidays: Holiday[] = [
      { date: '2025-06-06', localName: '현충일', countryCode: 'KR' },
    ]
    render(<CalendarGrid {...defaultProps} holidays={holidays} />)
    expect(screen.getByText('현충일')).toBeInTheDocument()
  })

  it('holidays가 없으면 공휴일 칩이 렌더링되지 않는다', () => {
    render(<CalendarGrid {...defaultProps} />)
    expect(screen.queryByText('현충일')).not.toBeInTheDocument()
  })

  it('그리드에 없는 날짜의 공휴일은 표시되지 않는다', () => {
    const holidays: Holiday[] = [
      { date: '2025-08-15', localName: '광복절', countryCode: 'KR' },
    ]
    render(<CalendarGrid {...defaultProps} holidays={holidays} />)
    expect(screen.queryByText('광복절')).not.toBeInTheDocument()
  })

  it('멀티데이 종일 이벤트는 title 속성이 있는 button으로 렌더링된다', () => {
    const multiEvent = makeEvent({
      id: 'multi-1',
      title: '근짱 일본',
      is_all_day: true,
      start_at: '2025-06-10T00:00:00Z',
      end_at: '2025-06-14T00:00:00Z',
    })
    render(<CalendarGrid {...defaultProps} events={[multiEvent]} />)
    const bar = screen.getByTitle('근짱 일본')
    expect(bar.tagName).toBe('BUTTON')
    expect(bar).toHaveTextContent('근짱 일본')
  })

  it('멀티데이 이벤트는 단일 이벤트 pill로 중복 렌더링되지 않는다', () => {
    const multiEvent = makeEvent({
      id: 'multi-2',
      title: '여행',
      is_all_day: true,
      start_at: '2025-06-09T00:00:00Z',
      end_at: '2025-06-12T00:00:00Z',
    })
    render(<CalendarGrid {...defaultProps} events={[multiEvent]} />)
    // title 속성 버튼 1개만 있어야 함 (overlay), 일반 pill로 중복 없음
    expect(screen.getAllByTitle('여행')).toHaveLength(1)
  })

  it('주 경계를 넘는 멀티데이 이벤트는 두 행 모두에 렌더링된다', () => {
    // 2025-06-12 (Thu) ~ 2025-06-16 (Mon): 1주차 Thu~Sat + 2주차 Sun~Mon
    const crossWeekEvent = makeEvent({
      id: 'cross-1',
      title: '주경계여행',
      is_all_day: true,
      start_at: '2025-06-12T00:00:00Z',
      end_at: '2025-06-16T00:00:00Z',
    })
    render(<CalendarGrid {...defaultProps} events={[crossWeekEvent]} />)
    const bars = screen.getAllByTitle('주경계여행')
    expect(bars).toHaveLength(2)
  })

  it('주 경계에서 잘린 이벤트 첫 segment는 ‹ 화살표가 없다', () => {
    const crossWeekEvent = makeEvent({
      id: 'cross-2',
      title: '크로스위크',
      is_all_day: true,
      start_at: '2025-06-12T00:00:00Z',
      end_at: '2025-06-16T00:00:00Z',
    })
    render(<CalendarGrid {...defaultProps} events={[crossWeekEvent]} />)
    const bars = screen.getAllByTitle('크로스위크')
    // 첫 번째 bar (isStart=true): ‹ 없음, › 있음
    expect(bars[0].textContent).not.toMatch(/‹/)
    expect(bars[0].textContent).toMatch(/›/)
    // 두 번째 bar (isEnd=true): ‹ 있음, › 없음
    expect(bars[1].textContent).toMatch(/‹/)
    expect(bars[1].textContent).not.toMatch(/›/)
  })

  it('showLunar=true 이면 음력 날짜가 표시된다', () => {
    render(<CalendarGrid {...defaultProps} showLunar={true} />)
    // 모킹된 값 4/20이 여러 셀에 표시되어야 함
    const lunarLabels = screen.getAllByText('4/20')
    expect(lunarLabels.length).toBeGreaterThan(0)
  })

  it('showLunar=false 이면 음력 날짜가 표시되지 않는다', () => {
    render(<CalendarGrid {...defaultProps} showLunar={false} />)
    expect(screen.queryByText('4/20')).not.toBeInTheDocument()
  })

  it('showLunar 기본값(미전달)이면 음력 날짜가 표시되지 않는다', () => {
    render(<CalendarGrid {...defaultProps} />)
    expect(screen.queryByText('4/20')).not.toBeInTheDocument()
  })

  it('공휴일 chip 래퍼에 px-0.5 패딩이 없다 (멀티데이 bar와 수평 정렬 유지)', () => {
    const holidays: Holiday[] = [{ date: '2025-06-06', localName: '현충일', countryCode: 'KR' }]
    render(<CalendarGrid {...defaultProps} holidays={holidays} />)
    const chip = screen.getByText('현충일')
    expect(chip.parentElement).not.toHaveClass('px-0.5')
  })

  it('단일 일정 pill 래퍼에 px-0.5 패딩이 없다 (멀티데이 bar와 수평 정렬 유지)', () => {
    render(<CalendarGrid {...defaultProps} />)
    const pill = screen.getByText('생일파티')
    expect(pill.parentElement).not.toHaveClass('px-0.5')
  })

  it('멀티데이 이벤트 bar 클릭 시 이벤트 시작일로 onSelectDate가 호출된다', () => {
    const multiEvent = makeEvent({
      id: 'multi-click',
      title: '클릭테스트',
      is_all_day: true,
      start_at: '2025-06-10T00:00:00Z',
      end_at: '2025-06-12T00:00:00Z',
    })
    render(<CalendarGrid {...defaultProps} events={[multiEvent]} />)
    fireEvent.click(screen.getByTitle('클릭테스트'))
    expect(defaultProps.onSelectDate).toHaveBeenCalledTimes(1)
    const calledDate: Date = defaultProps.onSelectDate.mock.calls[0][0]
    expect(calledDate.getFullYear()).toBe(2025)
    expect(calledDate.getMonth()).toBe(5)
    expect(calledDate.getDate()).toBe(10)
  })
})

// ── label_color 색상 우선순위 ────────────────────────────────

describe('라벨 색상 우선순위', () => {
  it('label_color가 있으면 일정 칩이 label_color를 사용한다', () => {
    const event = makeEvent({ label_color: '#10b981', title: '에메랄드 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('에메랄드 일정')
    expect(chip.style.backgroundColor).toBe('rgb(16, 185, 129)')
  })

  it('label_color가 null이면 캘린더 색상을 사용한다', () => {
    const event = makeEvent({ label_color: null, calendar_id: 'cal-1', title: '캘린더색 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('캘린더색 일정')
    // calendars[0].color = '#f97316'
    expect(chip.style.backgroundColor).toBe('rgb(249, 115, 22)')
  })

  it('label_color도 없고 calendar_id도 null이면 fallback 색상을 사용한다', () => {
    const event = makeEvent({ label_color: null, calendar_id: null, title: '폴백 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('폴백 일정')
    expect(chip.style.backgroundColor).toBe('rgb(148, 163, 184)')
  })
})
