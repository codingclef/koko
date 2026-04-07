import { render, act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { getEventsByMonth, getFamilyMembers } from '@/lib/calendar'

// ── 의존성 모킹 ──────────────────────────────────────────────
const mockReloadCalendars = jest.fn()
const mockUseCalendars = jest.fn<
  { calendars: []; loading: false; error: null; reload: typeof mockReloadCalendars },
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
  CalendarFilter: () => <div data-testid="calendar-filter" />,
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

const mockGetEventsByMonth = getEventsByMonth as jest.MockedFunction<typeof getEventsByMonth>
const mockGetFamilyMembers = getFamilyMembers as jest.MockedFunction<typeof getFamilyMembers>
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
      calendars: [],
      loading: false,
      error: null,
      reload: mockReloadCalendars,
    })
    mockGetEventsByMonth.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
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
    mockGetEventsByMonth.mockRejectedValueOnce(new Error('load failed'))

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
      .mockResolvedValueOnce([])

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
    await waitFor(() => expect(mockGetEventsByMonth).toHaveBeenCalledTimes(2))
  })
})
