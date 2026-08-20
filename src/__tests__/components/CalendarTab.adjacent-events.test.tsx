import { render, act, waitFor, fireEvent } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { getEventsByRange } from '@/lib/calendar'

const FIXED_NOW = new Date('2026-04-18T12:00:00Z')
const RealDate = Date
type DateArgs =
  | []
  | [string | number | Date]
  | [number, number, number?, number?, number?, number?, number?]

class MockDate extends Date {
  constructor(...args: DateArgs) {
    if (args.length === 0) {
      super(FIXED_NOW)
      return
    }
    if (args.length === 1) {
      super(args[0])
      return
    }
    if (args.length === 2) {
      super(args[0], args[1])
      return
    }
    if (args.length === 3) {
      super(args[0], args[1], args[2])
      return
    }
    if (args.length === 4) {
      super(args[0], args[1], args[2], args[3])
      return
    }
    if (args.length === 5) {
      super(args[0], args[1], args[2], args[3], args[4])
      return
    }
    if (args.length === 6) {
      super(args[0], args[1], args[2], args[3], args[4], args[5])
      return
    }
    super(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
  }

  static now() {
    return FIXED_NOW.getTime()
  }
}

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

let capturedRefresh: (() => Promise<void>) | null = null
let capturedRealtimeOptions: { refreshOnSubscribed?: boolean } | undefined
jest.mock('@/hooks/useRealtimeSync', () => ({
  useRealtimeSync: (
    _channel: unknown,
    refresh: () => Promise<void>,
    options?: { refreshOnSubscribed?: boolean }
  ) => {
    capturedRefresh = refresh
    capturedRealtimeOptions = options
    return jest.fn()
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
  getEventsByRange: jest.fn().mockResolvedValue([]),
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

const mockGetEventsByRange = getEventsByRange as jest.MockedFunction<typeof getEventsByRange>

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
  calendarsLoading: false,
  calendarsError: null,
  reloadCalendars: jest.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  global.Date = MockDate as DateConstructor
  jest.clearAllMocks()
  capturedRefresh = null
  capturedRealtimeOptions = undefined
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  global.Date = RealDate
  jest.restoreAllMocks()
})

// today = 2026-04-18, so April grid spans March 29 through May 2.
describe('CalendarTab — 표시 범위 이벤트 조회', () => {
  it('현재 월과 전월/다음월 셀 이벤트를 한 번의 범위 조회로 표시한다', async () => {
    const currentEvent = makeEvent('curr-1', '2026-04-15T09:00:00Z') // April
    const prevEvent    = makeEvent('prev-1', '2026-03-29T09:00:00Z') // March
    const nextEvent    = makeEvent('next-1', '2026-05-01T09:00:00Z') // May

    mockGetEventsByRange.mockResolvedValue([currentEvent, prevEvent, nextEvent])

    const { getByTestId } = render(<CalendarTab {...defaultProps} />)

    await waitFor(() => {
      const ids = getByTestId('calendar-grid').getAttribute('data-event-ids') ?? ''
      expect(ids).toContain('curr-1')
      expect(ids).toContain('prev-1')
      expect(ids).toContain('next-1')
    }, { timeout: 3000 })
    expect(mockGetEventsByRange).toHaveBeenCalledTimes(1)

    const [, start, endExclusive] = mockGetEventsByRange.mock.calls[0]
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 2, 29])
    expect([endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate()]).toEqual([2026, 4, 3])
  })

  it('다음 달로 이동한 뒤 이전 표시 범위의 늦은 응답을 무시한다', async () => {
    const aprilEvent = makeEvent('apr-1', '2026-04-15T09:00:00Z')
    const mayEvent   = makeEvent('may-1', '2026-05-10T09:00:00Z')

    let resolveApril!: (value: ReturnType<typeof makeEvent>[]) => void
    const aprilPromise = new Promise<ReturnType<typeof makeEvent>[]>((resolve) => {
      resolveApril = resolve
    })

    mockGetEventsByRange
      .mockReturnValueOnce(aprilPromise)
      .mockResolvedValueOnce([mayEvent])

    const { getByTestId, getByRole } = render(<CalendarTab {...defaultProps} />)
    await waitFor(() => expect(mockGetEventsByRange).toHaveBeenCalledTimes(1))

    fireEvent.click(getByRole('button', { name: '다음 달' }))
    await waitFor(() => {
      expect(getByTestId('calendar-grid')).toHaveAttribute('data-event-ids', 'may-1')
    })

    await act(async () => { resolveApril([aprilEvent]) })
    expect(getByTestId('calendar-grid')).toHaveAttribute('data-event-ids', 'may-1')
  })
})

describe('CalendarTab — Realtime 강제 갱신', () => {
  it('구독 성립 시 gap 보정 갱신을 비활성화하지 않는다', () => {
    render(<CalendarTab {...defaultProps} />)

    expect(capturedRealtimeOptions?.refreshOnSubscribed).not.toBe(false)
  })

  it('broadcast refresh가 기존 요청을 대체하고 기존 응답의 stale commit을 막는다', async () => {
    const staleEvent = makeEvent('stale', '2026-04-15T09:00:00Z')
    const freshEvent = makeEvent('fresh', '2026-04-16T09:00:00Z')
    let resolveInitial!: (value: ReturnType<typeof makeEvent>[]) => void

    mockGetEventsByRange.mockImplementationOnce(() => new Promise((resolve) => {
      resolveInitial = resolve
    })).mockResolvedValueOnce([freshEvent])

    const { getByTestId } = render(<CalendarTab {...defaultProps} />)
    await waitFor(() => expect(mockGetEventsByRange).toHaveBeenCalledTimes(1))

    expect(capturedRefresh).not.toBeNull()
    await act(async () => { await capturedRefresh!() })

    expect(mockGetEventsByRange).toHaveBeenCalledTimes(2)
    expect(getByTestId('calendar-grid')).toHaveAttribute('data-event-ids', 'fresh')

    await act(async () => {
      resolveInitial([staleEvent])
    })
    expect(getByTestId('calendar-grid')).toHaveAttribute('data-event-ids', 'fresh')
  })
})
