import { render, act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { getCalendarMembers, getEventsByMonth, getFamilyMembers } from '@/lib/calendar'

// ── 의존성 모킹 ──────────────────────────────────────────────
const mockReloadCalendars = jest.fn()
const mockUseCalendars = jest.fn<
  {
    calendars: {
      id: string
      family_id: string
      created_by: string
      name: string
      color: string
      created_at: string
      updated_at: string
    }[]
    loading: false
    error: null
    reload: typeof mockReloadCalendars
  },
  [string | null]
>(() => ({
  calendars: [],
  loading: false,
  error: null,
  reload: mockReloadCalendars,
}))

jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: (familyId: string | null) => mockUseCalendars(familyId),
}))
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
  CalendarGrid: () => <div data-testid="calendar-grid" />,
}))
jest.mock('@/components/calendar/DayEventsSheet', () => ({
  DayEventsSheet: () => <div />,
}))
jest.mock('@/components/calendar/EventDetailSheet', () => ({
  EventDetailSheet: () => <div />,
}))
jest.mock('@/components/calendar/EventFormModal', () => ({
  EventFormModal: () => <div />,
}))
jest.mock('@/components/calendar/CalendarFormModal', () => ({
  CalendarFormModal: () => <div />,
}))
jest.mock('@/components/calendar/CalendarListSheet', () => ({
  CalendarListSheet: () => <div />,
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
let consoleErrorSpy: jest.SpyInstance

describe('CalendarTab — touch-action 스크롤 차단', () => {
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseCalendars.mockReturnValue({
      calendars: [{
        id: 'cal-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족',
        color: '#f97316',
        created_at: '',
        updated_at: '',
      }],
      loading: false,
      error: null,
      reload: mockReloadCalendars,
    })
    mockGetEventsByMonth.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
    mockGetCalendarMembers.mockResolvedValue([])
  })

  it('모달이 없을 때 컨테이너에 touch-action: none이 적용된다', async () => {
    const { container } = render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )
    await act(async () => {})

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.touchAction).toBe('none')
  })

  it('초기 이벤트 로드 실패 시 오류 상태와 재시도 버튼을 표시한다', async () => {
    mockGetEventsByMonth.mockRejectedValue(new Error('load failed'))

    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    expect(await screen.findByText('캘린더를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
  })

  it('재시도 버튼 클릭 시 캘린더 데이터를 다시 불러온다', async () => {
    mockGetEventsByMonth
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue([])

    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    const retryButton = await screen.findByText('다시 시도')
    fireEvent.click(retryButton)

    await waitFor(() => expect(mockReloadCalendars).toHaveBeenCalled())
    await waitFor(() => expect(mockGetEventsByMonth).toHaveBeenCalledTimes(4))
    await waitFor(() => expect(screen.getByTestId('calendar-grid')).toBeInTheDocument())
  })

  it('캘린더 멤버 조회 실패 시 mutation error를 표시한다', async () => {
    mockGetCalendarMembers.mockRejectedValueOnce(new Error('members failed'))

    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    fireEvent.click(await screen.findByTestId('calendar-filter-edit'))

    expect(await screen.findByText('캘린더 멤버를 불러오지 못했어요')).toBeInTheDocument()
  })

  it('연월 헤더 버튼 클릭 시 YearMonthPickerSheet가 열린다', async () => {
    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )
    await act(async () => {})

    const today = new Date()
    const headerButton = screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) })
    fireEvent.click(headerButton)

    expect(screen.getByTestId('year-month-picker')).toBeInTheDocument()
  })

  it('피커 취소 시 연월이 변경되지 않고 피커가 닫힌다', async () => {
    const today = new Date()
    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))
    expect(screen.getByTestId('year-month-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('picker-cancel'))

    expect(screen.queryByTestId('year-month-picker')).not.toBeInTheDocument()
    expect(screen.getByText(`${today.getFullYear()}년 ${today.getMonth() + 1}월`)).toBeInTheDocument()
  })

  it('피커 확인 시 선택한 연월로 이동하고 피커가 닫힌다', async () => {
    const today = new Date()
    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )
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
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
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

    render(
      <CalendarTab
        preferences={null}
        user={{ id: 'user-1' } as User}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    expect(await screen.findByTestId('calendar-grid')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))

    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
    expect(screen.getByText(`${nextYear}년 ${nextMonth + 1}월`)).toBeInTheDocument()

    await act(async () => {
      resolvePrefetch?.([])
    })
  })
})
