import { render, act } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { CalendarTab } from '@/components/tabs/CalendarTab'

// ── 의존성 모킹 ──────────────────────────────────────────────
jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: () => ({ calendars: [], loading: false, reload: jest.fn() }),
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

describe('CalendarTab — touch-action 스크롤 차단', () => {
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
})
