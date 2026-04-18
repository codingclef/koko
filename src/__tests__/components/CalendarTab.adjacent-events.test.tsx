import { render, act, waitFor, fireEvent } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { getEventsByMonth } from '@/lib/calendar'

// CalendarGrid 는 events 를 data 속성으로 노출해 테스트에서 검증한다
jest.mock('@/components/calendar/CalendarGrid', () => ({
  CalendarGrid: ({ events, onSelectDate }: {
    events: { id: string }[]
    onSelectDate: (d: Date) => void
  }) => (
    <div data-testid="calendar-grid" data-event-ids={events.map((e) => e.id).join(',')}>
      <button data-testid="select-date" onClick={() => onSelectDate(new Date())}>date</button>
    </div>
  ),
}))

jest.mock('@/components/calendar/DayEventsSheet', () => ({
  DayEventsSheet: ({ events }: { events: { id: string }[] }) => (
    <div data-testid="day-events-sheet" data-event-ids={events.map((e) => e.id).join(',')} />
  ),
}))

jest.mock('@/hooks/useHolidays', () => ({ useHolidays: () => [] }))
jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      send: jest.fn(),
    })),
    removeChannel: jest.fn(),
  },
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }))
jest.mock('@/components/calendar/CalendarFilter', () => ({ CalendarFilter: () => <div /> }))
jest.mock('@/components/calendar/EventDetailSheet', () => ({ EventDetailSheet: () => <div /> }))
jest.mock('@/components/calendar/EventFormModal', () => ({ EventFormModal: () => <div /> }))
jest.mock('@/components/calendar/CalendarFormModal', () => ({ CalendarFormModal: () => <div /> }))
jest.mock('@/components/calendar/CalendarListSheet', () => ({ CalendarListSheet: () => <div /> }))
jest.mock('@/components/calendar/RecurrenceScopeSheet', () => ({ RecurrenceScopeSheet: () => <div /> }))
jest.mock('@/components/calendar/YearMonthPickerSheet', () => ({ YearMonthPickerSheet: () => <div /> }))
jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: jest.fn(),
  patchJsonWithAuth: jest.fn(),
  deleteWithAuth: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/calendar', () => ({
  getEventsByMonth: jest.fn().mockResolvedValue([]),
  createCalendar: jest.fn(),
  updateCalendar: jest.fn(),
  deleteCalendar: jest.fn(),
  getCalendarMembers: jest.fn().mockResolvedValue([]),
  getCalendarMembersForCalendars: jest.fn().mockResolvedValue([]),
  setCalendarMembers: jest.fn(),
  getFamilyMembers: jest.fn().mockResolvedValue([]),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getReminders: jest.fn().mockResolvedValue([]),
  setReminders: jest.fn(),
  CALENDAR_COLORS: [],
  REMINDER_OPTIONS: [],
}))

const mockGetEventsByMonth = getEventsByMonth as jest.MockedFunction<typeof getEventsByMonth>

function makeEvent(id: string, startAt: string) {
  return {
    id,
    family_id: 'fam-1',
    calendar_id: null,
    title: `이벤트 ${id}`,
    description: null,
    start_at: startAt,
    end_at: null,
    is_all_day: false,
    created_by: 'user-1',
    created_at: '',
    updated_at: '',
    series_id: null,
    series_occurrence_date: null,
    is_cancelled: false,
    label_color: null,
  }
}

const defaultProps = {
  preferences: null,
  updatePreferences: jest.fn().mockResolvedValue(undefined),
  user: { id: 'user-1' } as User,
  familyId: 'fam-1',
  isInitializing: false,
  calendars: [],
  calendarsError: null,
  reloadCalendars: jest.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

// today = 2026-04-18, so current month = April (month index 3)
// prev = March (2), next = May (4)
describe('CalendarTab — 인접 월 이벤트 표시', () => {
  it('현재 월 이벤트와 전월/다음월 이벤트가 모두 CalendarGrid 에 전달된다', async () => {
    const currentEvent = makeEvent('curr-1', '2026-04-15T09:00:00Z') // April
    const prevEvent    = makeEvent('prev-1', '2026-03-29T09:00:00Z') // March
    const nextEvent    = makeEvent('next-1', '2026-05-01T09:00:00Z') // May

    mockGetEventsByMonth.mockImplementation((_fid, _year, month) => {
      if (month === 3) return Promise.resolve([currentEvent]) // April
      if (month === 2) return Promise.resolve([prevEvent])    // March
      if (month === 4) return Promise.resolve([nextEvent])    // May
      return Promise.resolve([])
    })

    const { getByTestId } = render(<CalendarTab {...defaultProps} />)

    await waitFor(() => {
      const ids = getByTestId('calendar-grid').getAttribute('data-event-ids') ?? ''
      expect(ids).toContain('curr-1')
      expect(ids).toContain('prev-1')
      expect(ids).toContain('next-1')
    }, { timeout: 3000 })
  })

  it('같은 id 이벤트는 mergedEvents 에서 중복 없이 한 번만 포함된다', async () => {
    const event = makeEvent('dup-1', '2026-04-15T09:00:00Z')
    mockGetEventsByMonth.mockResolvedValue([event])

    const { getByTestId } = render(<CalendarTab {...defaultProps} />)

    await waitFor(() => {
      const ids = (getByTestId('calendar-grid').getAttribute('data-event-ids') ?? '')
        .split(',').filter(Boolean)
      expect(ids.filter((id) => id === 'dup-1')).toHaveLength(1)
    }, { timeout: 3000 })
  })

  it('다음 달로 이동 후 이전 달의 stale adjacentMonthEvents 가 현재 뷰를 덮어쓰지 않는다', async () => {
    // April 뷰에서 March fetch 가 지연되는 상황
    const aprilEvent = makeEvent('apr-1', '2026-04-15T09:00:00Z')
    const marchEvent = makeEvent('mar-1', '2026-03-29T09:00:00Z') // April 기준 전월
    const mayEvent   = makeEvent('may-1', '2026-05-10T09:00:00Z')
    const juneEvent  = makeEvent('jun-1', '2026-06-01T09:00:00Z') // May 기준 다음월

    let resolveMarch!: (v: ReturnType<typeof makeEvent>[]) => void
    const marchPromise = new Promise<ReturnType<typeof makeEvent>[]>((res) => { resolveMarch = res })

    mockGetEventsByMonth.mockImplementation((_fid, _year, month) => {
      if (month === 3) return Promise.resolve([aprilEvent])
      if (month === 2) return marchPromise              // March 지연 (April 의 인접 월)
      if (month === 4) return Promise.resolve([mayEvent])
      if (month === 5) return Promise.resolve([juneEvent])
      return Promise.resolve([])
    })

    const { getByTestId, getByRole } = render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    // 다음 달(May)로 이동
    fireEvent.click(getByRole('button', { name: '다음 달' }))
    await act(async () => {})

    // April 기준 March fetch 완료 (이미 May 뷰 상태)
    await act(async () => { resolveMarch([marchEvent]) })
    await act(async () => {})

    // race guard 가 동작해 March 이벤트가 May 뷰에 표시되면 안 됨
    const ids = getByTestId('calendar-grid').getAttribute('data-event-ids') ?? ''
    expect(ids).not.toContain('mar-1')
    expect(ids).toContain('may-1')
  })
})
