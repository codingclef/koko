/**
 * CalendarTab + YearMonthPickerSheet 통합 테스트
 * YearMonthPickerSheet를 실제 컴포넌트로 렌더해서
 * "헤더 클릭 → 실제 dialog 렌더 → Escape → dialog 사라짐" 흐름을 검증한다.
 */
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'

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
  CalendarFilter: () => <div />,
}))
jest.mock('@/components/calendar/CalendarGrid', () => ({
  CalendarGrid: () => <div data-testid="calendar-grid" />,
}))
jest.mock('@/components/calendar/DayEventsSheet', () => ({ DayEventsSheet: () => <div /> }))
jest.mock('@/components/calendar/EventDetailSheet', () => ({ EventDetailSheet: () => <div /> }))
jest.mock('@/components/calendar/EventFormModal', () => ({ EventFormModal: () => <div /> }))
jest.mock('@/components/calendar/CalendarFormModal', () => ({ CalendarFormModal: () => <div /> }))
jest.mock('@/components/calendar/CalendarListSheet', () => ({ CalendarListSheet: () => <div /> }))
// YearMonthPickerSheet는 실제 컴포넌트 사용 (mock 없음)

const defaultProps = {
  preferences: null,
  updatePreferences: jest.fn().mockResolvedValue(undefined),
  user: { id: 'user-1' } as User,
  familyId: 'fam-1',
  isInitializing: false,
  calendars: [],
  calendarsError: null,
  reloadCalendars: jest.fn(),
}

describe('CalendarTab + YearMonthPickerSheet 통합', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('헤더 버튼 클릭 시 실제 YearMonthPickerSheet dialog가 렌더된다', async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    const today = new Date()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))

    expect(await screen.findByRole('dialog', { name: '연월 선택' })).toBeInTheDocument()
  })

  it('dialog가 열린 상태에서 Escape 키 입력 시 dialog가 닫힌다', async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    const today = new Date()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))
    expect(await screen.findByRole('dialog', { name: '연월 선택' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '연월 선택' })).not.toBeInTheDocument()
    })
  })

  it('dialog 내 취소 버튼 클릭 시 dialog가 닫힌다', async () => {
    render(<CalendarTab {...defaultProps} />)
    await act(async () => {})

    const today = new Date()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${today.getFullYear()}년`) }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog', { name: '연월 선택' })).not.toBeInTheDocument()
  })
})
