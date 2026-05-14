import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  CalendarGrid,
  buildGrid,
  isMultiDayAllDay,
  isEventOnDate,
  computeSegments,
  computeLaneHeightsByColumn,
  getSingleEventDisplayBudget,
  getHolidayBlockHeight,
  getHolidayOverlayOffset,
} from '@/components/calendar/CalendarGrid'
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

describe('computeLaneHeightsByColumn', () => {
  it('이벤트가 걸친 날짜만 lane 높이를 예약하고 다른 날짜는 0으로 둔다', () => {
    const row = makeRow(2026, 4, 24) // 2026-05-24 ~ 2026-05-30
    const segs = computeSegments(row, [
      makeEvent({
        id: 'trip',
        is_all_day: true,
        start_at: '2026-05-28T00:00:00Z',
        end_at: '2026-06-02T00:00:00Z',
      }),
    ])

    expect(computeLaneHeightsByColumn(segs)).toEqual([0, 0, 0, 0, 18, 18, 18])
  })

  it('겹치는 멀티데이 이벤트는 해당 날짜 열만 더 큰 lane 높이를 예약한다', () => {
    const row = makeRow(2025, 5, 8) // 2025-06-08 ~ 2025-06-14
    const segs = computeSegments(row, [
      makeEvent({
        id: 'a',
        is_all_day: true,
        start_at: '2025-06-09T00:00:00Z',
        end_at: '2025-06-12T00:00:00Z',
      }),
      makeEvent({
        id: 'b',
        is_all_day: true,
        start_at: '2025-06-10T00:00:00Z',
        end_at: '2025-06-11T00:00:00Z',
      }),
    ])

    expect(computeLaneHeightsByColumn(segs)).toEqual([0, 18, 36, 36, 18, 0, 0])
  })
})

describe('holiday overlay helpers', () => {
  it('공휴일 block 높이와 overlay offset을 올바르게 계산한다', () => {
    expect(getHolidayBlockHeight(0)).toBe(0)
    expect(getHolidayBlockHeight(1)).toBe(17)
    expect(getHolidayBlockHeight(2)).toBe(36)
    expect(getHolidayOverlayOffset(0)).toBe(0)
    expect(getHolidayOverlayOffset(1)).toBe(19)
    expect(getHolidayOverlayOffset(2)).toBe(38)
  })

  it('같은 주에서는 최대 공휴일 높이만큼 멀티데이 lane을 일괄 오프셋한다', () => {
    const row = makeRow(2025, 5, 15)
    const segments = computeSegments(row, [
      makeEvent({
        id: 'trip',
        is_all_day: true,
        start_at: '2025-06-15T00:00:00Z',
        end_at: '2025-06-16T00:00:00Z',
      }),
    ])

    expect(computeLaneHeightsByColumn(segments, getHolidayOverlayOffset(1))).toEqual([37, 37, 0, 0, 0, 0, 0])
  })
})

// ── 동적 단일 일정 표시 개수 ─────────────────────────────────

describe('getSingleEventDisplayBudget', () => {
  const base = {
    dateHeaderHeight: 28,
    laneAreaHeight: 0,
    holidayCount: 0,
    hasHolidaysAndEvents: false,
  }

  it('측정 전에는 기존 3개 기준으로 안전하게 fallback 한다', () => {
    expect(getSingleEventDisplayBudget({
      ...base,
      rowHeight: null,
      singleEventCount: 5,
    })).toEqual({ visibleCount: 3, showOverflow: true })
  })

  it('셀 높이가 충분하면 고정 상한 없이 들어가는 만큼 표시한다', () => {
    expect(getSingleEventDisplayBudget({
      ...base,
      rowHeight: 150,
      singleEventCount: 6,
    })).toEqual({ visibleCount: 6, showOverflow: false })
  })

  it('실제 chip gap과 cell chrome을 고려해 exact-fit 케이스를 보수적으로 줄인다', () => {
    expect(getSingleEventDisplayBudget({
      ...base,
      rowHeight: 118,
      singleEventCount: 5,
    })).toEqual({ visibleCount: 3, showOverflow: true })
  })

  it('6주 월처럼 낮은 셀에서는 표시 개수를 줄여 overflow 줄까지 포함해 맞춘다', () => {
    expect(getSingleEventDisplayBudget({
      ...base,
      rowHeight: 96,
      singleEventCount: 5,
    })).toEqual({ visibleCount: 2, showOverflow: true })
  })

  it('단일 일정 영역이 0줄이면 +N도 표시하지 않는다', () => {
    expect(getSingleEventDisplayBudget({
      rowHeight: 60,
      dateHeaderHeight: 40,
      laneAreaHeight: 18,
      holidayCount: 1,
      hasHolidaysAndEvents: true,
      singleEventCount: 3,
    })).toEqual({ visibleCount: 0, showOverflow: false })
  })

  it('음력, 멀티데이 lane, 공휴일이 있으면 남은 공간 기준으로 더 적게 표시한다', () => {
    expect(getSingleEventDisplayBudget({
      rowHeight: 118,
      dateHeaderHeight: 40,
      laneAreaHeight: 18,
      holidayCount: 1,
      hasHolidaysAndEvents: true,
      singleEventCount: 4,
    })).toEqual({ visibleCount: 1, showOverflow: true })
  })
})

// ── CalendarGrid 렌더링 ──────────────────────────────────────

describe('CalendarGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('측정된 셀 높이가 충분하면 렌더링에서도 3개 제한을 넘겨 표시한다', async () => {
    const getBoundingClientRectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute('data-testid') === 'calendar-grid') {
          return { width: 390, height: 778, top: 0, left: 0, right: 390, bottom: 778, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
        }
        if (this.className === 'grid grid-cols-7') {
          return { width: 390, height: 28, top: 0, left: 0, right: 390, bottom: 28, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
        }
        return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      })
    const events = Array.from({ length: 6 }, (_, i) => makeEvent({
      id: `evt-dynamic-${i}`,
      title: `동적일정${i + 1}`,
      start_at: '2025-06-15T10:00:00Z',
    }))

    try {
      render(<CalendarGrid {...defaultProps} events={events} />)

      await waitFor(() => {
        expect(screen.getByText('동적일정6')).toBeInTheDocument()
      })
      expect(screen.queryByText('+3')).not.toBeInTheDocument()
    } finally {
      getBoundingClientRectSpy.mockRestore()
    }
  })

  it('날짜 클릭 시 onSelectDate가 호출된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    const dayCells = screen.getAllByRole('button')
    fireEvent.click(dayCells[0])
    expect(defaultProps.onSelectDate).toHaveBeenCalledTimes(1)
  })

  it('날짜 셀에 aria-label이 있다', () => {
    render(<CalendarGrid {...defaultProps} />)
    // 2025년 6월 15일 셀 확인
    expect(screen.getByRole('button', { name: '2025년 6월 15일' })).toBeInTheDocument()
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

  it('월 경계 멀티데이 종일 일정은 실제로 겹치는 날짜 셀에만 lane spacer를 만든다', () => {
    const events = [
      makeEvent({
        id: 'cross-month',
        title: '근짱 일본',
        is_all_day: true,
        start_at: '2026-05-28T00:00:00Z',
        end_at: '2026-06-02T00:00:00Z',
      }),
      makeEvent({
        id: 'front-day',
        title: '부처님오신날',
        is_all_day: true,
        start_at: '2026-05-24T00:00:00Z',
        end_at: '2026-05-24T00:00:00Z',
      }),
      makeEvent({
        id: 'mid-day',
        title: '대체공휴일',
        is_all_day: true,
        start_at: '2026-05-25T00:00:00Z',
        end_at: '2026-05-25T00:00:00Z',
      }),
    ]

    render(<CalendarGrid {...defaultProps} year={2026} month={4} events={events} />)

    expect(screen.getByTestId('lane-spacer-2026-05-24')).toHaveStyle({ height: '0px' })
    expect(screen.getByTestId('lane-spacer-2026-05-25')).toHaveStyle({ height: '0px' })
    expect(screen.getByTestId('lane-spacer-2026-05-28')).toHaveStyle({ height: '18px' })
    expect(screen.getByTestId('lane-spacer-2026-05-29')).toHaveStyle({ height: '18px' })
    expect(screen.getByTestId('lane-spacer-2026-05-30')).toHaveStyle({ height: '18px' })
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

// ── label_color 색상 우선순위 (is_all_day=true 기준: solid fill) ──

describe('라벨 색상 우선순위', () => {
  it('label_color가 있으면 일정 칩이 label_color의 display 색상을 사용한다', () => {
    const event = makeEvent({ is_all_day: true, label_color: '#10b981', title: '에메랄드 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('에메랄드 일정')
    // #10b981 → toDisplayColor → #30b87c = rgb(48, 184, 124)
    expect(chip.style.backgroundColor).toBe('rgb(48, 184, 124)')
  })

  it('label_color가 null이면 캘린더 색상의 display 색상을 사용한다', () => {
    const event = makeEvent({ is_all_day: true, label_color: null, calendar_id: 'cal-1', title: '캘린더색 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('캘린더색 일정')
    // calendars[0].color = '#f97316' → toDisplayColor → #e89454 = rgb(232, 148, 84)
    expect(chip.style.backgroundColor).toBe('rgb(232, 148, 84)')
  })

  it('label_color도 없고 calendar_id도 null이면 fallback hex 색상을 사용한다', () => {
    const event = makeEvent({ is_all_day: true, label_color: null, calendar_id: null, title: '폴백 일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('폴백 일정')
    // fallback #94a3b8 = rgb(148, 163, 184)
    expect(chip.style.backgroundColor).toBe('rgb(148, 163, 184)')
  })

  it('calendar_id=null, label_color=null, is_all_day=false 이벤트는 fallback 색 tint 배경으로 렌더된다', () => {
    const event = makeEvent({ is_all_day: false, label_color: null, calendar_id: null, title: '폴백 timed' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('폴백 timed')
    // timed: color+'26' tint bg + fallback color text (no var() concatenation bug)
    // #94a3b826 → rgba(148, 163, 184, 0.15)
    expect(chip.style.backgroundColor).toBe('rgba(148, 163, 184, 0.15)')
    expect(chip.style.color).toBe('rgb(148, 163, 184)')
    expect(chip.className).not.toContain('text-white')
  })
})

// ── 칩 variant: allDay vs timed ──────────────────────────────

describe('칩 variant', () => {
  it('is_all_day=true 단일 일정은 solid fill + white text로 렌더된다', () => {
    const event = makeEvent({ is_all_day: true, title: '종일일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('종일일정')
    // #f97316 → toDisplayColor → #e89454 = rgb(232, 148, 84)
    expect(chip.style.backgroundColor).toBe('rgb(232, 148, 84)')
    expect(chip.style.color).toBe('')
    expect(chip.style.boxShadow).toBe('')
    expect(chip.className).toContain('text-white')
  })

  it('is_all_day=false 단일 일정은 tint 배경 + colored text로 렌더된다', () => {
    const event = makeEvent({ is_all_day: false, title: '시간일정' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('시간일정')
    // #e8945426 → rgba(232, 148, 84, 0.15)
    expect(chip.style.backgroundColor).toBe('rgba(232, 148, 84, 0.15)')
    expect(chip.style.color).toBe('rgb(232, 148, 84)')
    expect(chip.style.boxShadow).toBe('')
    expect(chip.className).not.toContain('text-white')
  })

  it('같은 날 allDay + timed 이벤트가 함께 있을 때 둘 다 올바른 variant로 렌더된다', () => {
    const allDay = makeEvent({ id: 'a1', is_all_day: true, title: '종일', start_at: '2025-06-15T00:00:00Z' })
    const timed = makeEvent({ id: 'a2', is_all_day: false, title: '시간', start_at: '2025-06-15T10:00:00Z' })
    render(<CalendarGrid {...defaultProps} events={[allDay, timed]} />)

    const allDayChip = screen.getByText('종일')
    expect(allDayChip.style.backgroundColor).toBe('rgb(232, 148, 84)')
    expect(allDayChip.className).toContain('text-white')

    const timedChip = screen.getByText('시간')
    expect(timedChip.style.backgroundColor).toBe('rgba(232, 148, 84, 0.15)')
    expect(timedChip.style.color).toBe('rgb(232, 148, 84)')
  })

  it('공휴일 칩은 variant 영향 없이 기존 red solid를 유지한다', () => {
    const holidays = [{ date: '2025-06-06', localName: '현충일', countryCode: 'KR' }]
    render(<CalendarGrid {...defaultProps} holidays={holidays} />)
    const chip = screen.getByText('현충일')
    expect(chip.className).toContain('bg-red-400')
  })

  it('긴 제목의 timed 칩도 overflow-hidden whitespace-nowrap을 유지한다', () => {
    const event = makeEvent({ is_all_day: false, title: '제목이매우긴시간지정일정입니다넘치면어떻게되나요' })
    render(<CalendarGrid {...defaultProps} events={[event]} />)
    const chip = screen.getByText('제목이매우긴시간지정일정입니다넘치면어떻게되나요')
    expect(chip.className).toContain('overflow-hidden')
    expect(chip.className).toContain('whitespace-nowrap')
  })
})

// ── 공휴일·이벤트 칩 간격 ────────────────────────────────────

describe('공휴일-이벤트 칩 간격', () => {
  it('공휴일과 이벤트가 같은 날에 있으면 이벤트 블록에 mt-0.5가 적용된다', () => {
    const holidays: Holiday[] = [{ date: '2025-06-15', localName: '테스트공휴일', countryCode: 'KR' }]
    const event = makeEvent({ title: '테스트일정', start_at: '2025-06-15T10:00:00Z' })
    render(<CalendarGrid {...defaultProps} events={[event]} holidays={holidays} />)
    const chip = screen.getByText('테스트일정')
    expect(chip.parentElement).toHaveClass('mt-0.5')
  })

  it('이벤트만 있고 같은 날 공휴일이 없으면 이벤트 블록에 mt-0.5가 없다', () => {
    render(<CalendarGrid {...defaultProps} />)
    const chip = screen.getByText('생일파티')
    expect(chip.parentElement).not.toHaveClass('mt-0.5')
  })

  it('공휴일이 다른 날에 있으면 이벤트 날짜의 블록에 mt-0.5가 없다', () => {
    const holidays: Holiday[] = [{ date: '2025-06-06', localName: '현충일', countryCode: 'KR' }]
    render(<CalendarGrid {...defaultProps} holidays={holidays} />)
    // 이벤트(생일파티)는 6/15, 공휴일은 6/6 → 6/15 이벤트 블록에 mt-0.5 없어야 함
    const chip = screen.getByText('생일파티')
    expect(chip.parentElement).not.toHaveClass('mt-0.5')
  })

  it('같은 주에 공휴일과 멀티데이 종일 일정이 겹치면 멀티데이 bar가 공휴일 아래에서 시작한다', () => {
    const holidays: Holiday[] = [{ date: '2025-06-15', localName: '테스트공휴일', countryCode: 'KR' }]
    const event = makeEvent({
      id: 'row-priority',
      title: '연속휴가',
      is_all_day: true,
      start_at: '2025-06-15T00:00:00Z',
      end_at: '2025-06-16T00:00:00Z',
    })

    render(<CalendarGrid {...defaultProps} events={[event]} holidays={holidays} />)

    expect(screen.getByTestId('lane-spacer-2025-06-15')).toHaveStyle({ height: '37px' })
    expect(screen.getByTestId('lane-spacer-2025-06-16')).toHaveStyle({ height: '37px' })
    expect(screen.getByTestId('multi-segment-row-priority-row2')).toHaveStyle({ top: '19px' })
  })

  it('같은 주 내부 공휴일 변화로 멀티데이 bar가 분절되지 않는다', () => {
    const holidays: Holiday[] = [
      { date: '2025-06-17', localName: '테스트공휴일', countryCode: 'KR' },
      { date: '2025-06-18', localName: '테스트공휴일2', countryCode: 'KR' },
    ]
    const event = makeEvent({
      id: 'holiday-split',
      title: '연속휴가',
      is_all_day: true,
      start_at: '2025-06-15T00:00:00Z',
      end_at: '2025-06-18T00:00:00Z',
    })

    render(<CalendarGrid {...defaultProps} events={[event]} holidays={holidays} />)

    const bars = screen.getAllByTitle('연속휴가')
    expect(bars).toHaveLength(1)
    expect(bars[0].textContent).not.toMatch(/[‹›]/)
  })
})

describe('buildGrid — trailing adjacent-month cells', () => {
  it('2026년 4월 뷰에서 5/2(토)가 그리드에 포함된다', () => {
    const cells = buildGrid(2026, 3) // month=3 → April
    const dates = cells.map((c) => `${c.date.getFullYear()}-${c.date.getMonth() + 1}-${c.date.getDate()}`)
    expect(dates).toContain('2026-5-2')
  })

  it('2026년 5월 뷰에서 6/4~6/6이 그리드에 포함된다', () => {
    const cells = buildGrid(2026, 4) // month=4 → May
    const dates = cells.map((c) => `${c.date.getFullYear()}-${c.date.getMonth() + 1}-${c.date.getDate()}`)
    expect(dates).toContain('2026-6-4')
    expect(dates).toContain('2026-6-5')
    expect(dates).toContain('2026-6-6')
  })

  it('그리드 총 셀 수는 항상 7의 배수다', () => {
    for (const [year, month] of [[2026, 0], [2026, 3], [2026, 4], [2026, 11]] as [number, number][]) {
      const cells = buildGrid(year, month)
      expect(cells.length % 7).toBe(0)
    }
  })
})
