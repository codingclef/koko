import { render, act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { getCalendarMembers, getEventsByMonth, getFamilyMembers, setCalendarMembers, updateCalendar } from '@/lib/calendar'
import { deleteWithAuth } from '@/lib/api-client'

// ── 의존성 모킹 ──────────────────────────────────────────────
const mockReloadCalendars = jest.fn()
jest.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: null, loading: false, updatePreferences: jest.fn() }),
}))
jest.mock('@/hooks/useHolidays', () => ({
  useHolidays: () => [],
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
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))
jest.mock('@/components/calendar/CalendarFilter', () => ({
  CalendarFilter: ({ onEdit }: {
    onEdit: (calendar: {
      id: string
      family_id: string
      created_by: string
      name: string
      color: string
      created_at: string
      updated_at: string
    }) => void
  }) => (
    <button
      data-testid="calendar-filter-edit"
      onClick={() => onEdit({
        id: 'cal-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족',
        color: '#f97316',
        created_at: '',
        updated_at: '',
      })}
    >
      edit
    </button>
  ),
}))
jest.mock('@/components/calendar/CalendarGrid', () => ({
  CalendarGrid: ({ onSelectDate }: { onSelectDate: (date: Date) => void }) => (
    <div data-testid="calendar-grid">
      <button data-testid="select-date" onClick={() => onSelectDate(new Date('2026-04-17T00:00:00Z'))}>date</button>
    </div>
  ),
}))
jest.mock('@/components/calendar/DayEventsSheet', () => ({
  DayEventsSheet: ({ onSelectEvent }: { onSelectEvent: (event: unknown) => void }) => (
    <div data-testid="day-events-sheet">
      <button
        data-testid="select-recurring-event"
        onClick={() => onSelectEvent({
          id: 'evt-series-1',
          family_id: 'fam-1',
          calendar_id: 'cal-1',
          title: '반복 일정',
          description: null,
          start_at: '2026-04-17T09:00:00.000Z',
          end_at: '2026-04-17T10:00:00.000Z',
          is_all_day: false,
          created_by: 'user-1',
          created_at: '',
          updated_at: '',
          series_id: 'series-1',
          series_occurrence_date: '2026-04-17',
          is_cancelled: false,
        })}
      >
        event
      </button>
    </div>
  ),
}))
jest.mock('@/components/calendar/EventDetailSheet', () => ({
  EventDetailSheet: ({ onDelete, onClose }: { onDelete: () => Promise<void>; onClose: () => void }) => (
    <div data-testid="event-detail-sheet">
      <button
        data-testid="detail-delete"
        onClick={async () => {
          await onDelete()
          onClose()
        }}
      >
        delete
      </button>
    </div>
  ),
}))
jest.mock('@/components/calendar/EventFormModal', () => ({
  EventFormModal: () => <div />,
}))
jest.mock('@/components/calendar/CalendarFormModal', () => ({
  CalendarFormModal: () => <div />,
}))
jest.mock('@/components/calendar/CalendarListSheet', () => ({
  CalendarListSheet: ({
    onSave,
    onDelete,
  }: {
    onSave: (calendarId: string, name: string, color: string, memberIds: string[] | null) => Promise<{ status: string }>
    onDelete: (calendarId: string) => Promise<void>
  }) => (
    <div data-testid="calendar-list-sheet">
      <button data-testid="list-save-null-members" onClick={() => onSave('cal-1', '가족', '#f97316', null)} />
      <button data-testid="list-save-with-members" onClick={() => onSave('cal-1', '가족', '#f97316', ['user-2'])} />
      <button data-testid="list-delete" onClick={() => onDelete('cal-1')} />
    </div>
  ),
}))
jest.mock('@/components/calendar/RecurrenceScopeSheet', () => ({
  RecurrenceScopeSheet: ({ onSelect }: { onSelect: (scope: 'single' | 'following' | 'all') => void }) => (
    <div data-testid="recurrence-scope-sheet">
      <button data-testid="scope-all" onClick={() => onSelect('all')}>all</button>
    </div>
  ),
}))
jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: jest.fn(),
  patchJsonWithAuth: jest.fn(),
  deleteWithAuth: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/components/calendar/YearMonthPickerSheet', () => ({
  YearMonthPickerSheet: ({
    onConfirm,
    onClose,
    year,
    month,
  }: {
    onConfirm: (year: number, month: number) => void
    onClose: () => void
    year: number
    month: number
  }) => (
    <div data-testid="year-month-picker">
      <button data-testid="picker-confirm" onClick={() => onConfirm(year + 1, month)}>확인</button>
      <button data-testid="picker-cancel" onClick={onClose}>취소</button>
    </div>
  ),
}))

const mockGetEventsByMonth = getEventsByMonth as jest.MockedFunction<typeof getEventsByMonth>
const mockGetFamilyMembers = getFamilyMembers as jest.MockedFunction<typeof getFamilyMembers>
const mockGetCalendarMembers = getCalendarMembers as jest.MockedFunction<typeof getCalendarMembers>
const mockSetCalendarMembers = setCalendarMembers as jest.MockedFunction<typeof setCalendarMembers>
const mockUpdateCalendar = updateCalendar as jest.MockedFunction<typeof updateCalendar>
const mockDeleteWithAuth = deleteWithAuth as jest.MockedFunction<typeof deleteWithAuth>
let consoleErrorSpy: jest.SpyInstance
const mockCalendars = [{
  id: 'cal-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  name: '가족',
  color: '#f97316',
  created_at: '',
  updated_at: '',
}]

const defaultProps = {
  preferences: null,
  user: { id: 'user-1' } as User,
  familyId: 'fam-1',
  isInitializing: false,
  calendars: mockCalendars,
  calendarsError: null,
  reloadCalendars: mockReloadCalendars,
}

describe('CalendarTab — touch-action 스크롤 차단', () => {
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetEventsByMonth.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
    mockGetCalendarMembers.mockResolvedValue([])
    mockDeleteWithAuth.mockResolvedValue(undefined)
  })

  it('모달이 없을 때 컨테이너에 touch-action: none이 적용된다', async () => {
    const { container } = render(
      <CalendarTab {...defaultProps} />
    )
    await act(async () => {})

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.touchAction).toBe('none')
  })

  it('초기 이벤트 로드 실패 시 전체 스피너 대신 오류 배너와 캘린더 그리드를 유지한다', async () => {
    mockGetEventsByMonth.mockRejectedValue(new Error('load failed'))

    render(<CalendarTab {...defaultProps} />)

    expect(await screen.findByText('이번 달 일정을 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
  })

  it('초기 이벤트 로딩 중이나 빈 상태에서는 메인 상태 문구를 표시하지 않는다', async () => {
    render(<CalendarTab {...defaultProps} />)

    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
    expect(screen.queryByText('이번 달 일정을 불러오는 중이에요.')).not.toBeInTheDocument()
    expect(screen.queryByText('이번 달 등록된 일정이 없어요.')).not.toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByText('이번 달 등록된 일정이 없어요.')).not.toBeInTheDocument()
  })

  it('재시도 버튼 클릭 시 캘린더 데이터를 다시 불러온다', async () => {
    mockGetEventsByMonth
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue([])

    render(<CalendarTab {...defaultProps} />)

    const retryButton = await screen.findByText('다시 시도')
    fireEvent.click(retryButton)

    await waitFor(() => expect(mockReloadCalendars).toHaveBeenCalled())
    await waitFor(() => expect(mockGetEventsByMonth).toHaveBeenCalledTimes(4))
    await waitFor(() => expect(screen.getByTestId('calendar-grid')).toBeInTheDocument())
  })

  it('캘린더 멤버 조회 실패 시 mutation error를 표시한다', async () => {
    mockGetCalendarMembers.mockRejectedValueOnce(new Error('members failed'))

    render(<CalendarTab {...defaultProps} />)

    fireEvent.click(await screen.findByTestId('calendar-filter-edit'))

    expect(await screen.findByText('캘린더 멤버를 불러오지 못했어요')).toBeInTheDocument()
  })

  it('연월 헤더 버튼 클릭 시 YearMonthPickerSheet가 열린다', async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    const today = new Date()
    const headerButton = screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) })
    fireEvent.click(headerButton)

    expect(screen.getByTestId('year-month-picker')).toBeInTheDocument()
  })

  it('피커 취소 시 연월이 변경되지 않고 피커가 닫힌다', async () => {
    const today = new Date()
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))
    expect(screen.getByTestId('year-month-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('picker-cancel'))

    expect(screen.queryByTestId('year-month-picker')).not.toBeInTheDocument()
    expect(screen.getByText(`${today.getFullYear()}년 ${today.getMonth() + 1}월`)).toBeInTheDocument()
  })

  it('피커 확인 시 선택한 연월로 이동하고 피커가 닫힌다', async () => {
    const today = new Date()
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))
    fireEvent.click(screen.getByTestId('picker-confirm'))

    await waitFor(() => {
      expect(screen.queryByTestId('year-month-picker')).not.toBeInTheDocument()
      expect(screen.getByText(`${today.getFullYear() + 1}년 ${today.getMonth() + 1}월`)).toBeInTheDocument()
    })
  })

  it('피커가 열린 상태에서 isModalOpen이 true가 되어 touch-action이 auto로 바뀐다', async () => {
    const today = new Date()
    const { container } = render(
      <CalendarTab {...defaultProps} />
    )
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.touchAction).toBe('auto')
  })

  it('월 이동 중에도 전체 스피너 대신 캘린더 그리드를 유지한다', async () => {
    const today = new Date()
    const initialYear = today.getFullYear()
    const initialMonth = today.getMonth()
    const nextYear = initialMonth === 11 ? initialYear + 1 : initialYear
    const nextMonth = initialMonth === 11 ? 0 : initialMonth + 1
    const monthAfterNextYear = nextMonth === 11 ? nextYear + 1 : nextYear
    const monthAfterNext = nextMonth === 11 ? 0 : nextMonth + 1
    let resolvePrefetch: ((value: []) => void) | null = null
    mockGetEventsByMonth.mockImplementation(async (_familyId, year, month) => {
      if (year === monthAfterNextYear && month === monthAfterNext) {
        return new Promise((resolve) => {
          resolvePrefetch = resolve as (value: []) => void
        })
      }
      return []
    })

    render(<CalendarTab {...defaultProps} />)

    expect(await screen.findByTestId('calendar-grid')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))

    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
    expect(screen.getByText(`${nextYear}년 ${nextMonth + 1}월`)).toBeInTheDocument()

    await act(async () => {
      resolvePrefetch?.([])
    })
  })

  it('반복 일정 삭제 scope 선택 후에도 대상 이벤트를 유지해 all 삭제를 호출한다', async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    fireEvent.click(screen.getByTestId('select-date'))
    fireEvent.click(screen.getByTestId('select-recurring-event'))
    fireEvent.click(screen.getByTestId('detail-delete'))
    fireEvent.click(await screen.findByTestId('scope-all'))

    await waitFor(() => {
      expect(mockDeleteWithAuth).toHaveBeenCalledWith(
        '/api/events/evt-series-1?scope=all&anchorOccurrenceDate=2026-04-17'
      )
    })
  })
})

describe('CalendarTab — handleCalendarUpdate', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetEventsByMonth.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
    mockGetCalendarMembers.mockResolvedValue([])
    mockUpdateCalendar.mockResolvedValue(undefined)
    mockSetCalendarMembers.mockResolvedValue(undefined)
  })

  const openCalendarList = async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: '캘린더 리스트' }))
    await screen.findByTestId('calendar-list-sheet')
  }

  it('memberIds null 이면 setCalendarMembers를 호출하지 않는다', async () => {
    await openCalendarList()

    fireEvent.click(screen.getByTestId('list-save-null-members'))

    await waitFor(() => {
      expect(mockUpdateCalendar).toHaveBeenCalledWith('cal-1', { name: '가족', color: '#f97316' })
      expect(mockSetCalendarMembers).not.toHaveBeenCalled()
    })
  })

  it('memberIds 배열이면 setCalendarMembers를 호출한다', async () => {
    await openCalendarList()

    fireEvent.click(screen.getByTestId('list-save-with-members'))

    await waitFor(() => {
      expect(mockSetCalendarMembers).toHaveBeenCalledWith('cal-1', 'user-1', ['user-2'])
    })
  })

  it('setCalendarMembers 실패 시 CalendarTab 에러 배너를 표시하지 않는다 (부분 성공)', async () => {
    mockSetCalendarMembers.mockRejectedValue(new Error('member save failed'))

    await openCalendarList()
    fireEvent.click(screen.getByTestId('list-save-with-members'))

    await waitFor(() => {
      expect(mockUpdateCalendar).toHaveBeenCalled()
      expect(mockSetCalendarMembers).toHaveBeenCalled()
    })
    // 부분 성공은 throw가 아닌 partial 반환이므로 CalendarTab 에러 배너 없음
    expect(screen.queryByText('캘린더를 저장하지 못했어요')).not.toBeInTheDocument()
  })
})
