import { render, act } from '@testing-library/react'
import { CalendarTab } from '@/components/tabs/CalendarTab'

// ── 의존성 모킹 ──────────────────────────────────────────────
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}))
jest.mock('@/hooks/useFamily', () => ({
  useFamily: () => ({ familyId: 'fam-1', loading: false }),
}))
jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: () => ({ calendars: [], loading: false, reload: jest.fn() }),
}))
jest.mock('@/lib/calendar', () => ({
  getEventsByMonth: jest.fn().mockResolvedValue([]),
  createCalendar: jest.fn(),
  updateCalendar: jest.fn(),
  deleteCalendar: jest.fn(),
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

describe('CalendarTab — touch-action 스크롤 차단', () => {
  it('모달이 없을 때 컨테이너에 touch-action: none이 적용된다', async () => {
    const { container } = render(<CalendarTab />)
    await act(async () => {})

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.touchAction).toBe('none')
  })
})
