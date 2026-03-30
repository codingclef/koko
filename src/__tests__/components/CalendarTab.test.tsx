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

// ── 헬퍼 ─────────────────────────────────────────────────────
function makeTouchEvent(target: EventTarget) {
  return new TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [],
    changedTouches: [],
    targetTouches: [],
  })
}

describe('CalendarTab — document touchmove 스크롤 차단', () => {
  it('모달이 없을 때 캘린더 컨테이너 내부 touchmove를 preventDefault 한다', async () => {
    const { container } = render(<CalendarTab />)
    await act(async () => {})

    const inner = container.firstChild as HTMLElement
    const event = makeTouchEvent(inner)
    Object.defineProperty(event, 'target', { value: inner, configurable: true })
    const preventSpy = jest.spyOn(event, 'preventDefault')

    await act(async () => {
      document.dispatchEvent(event)
    })

    expect(preventSpy).toHaveBeenCalled()
  })

  it('컨테이너 외부 touchmove는 preventDefault 하지 않는다', async () => {
    render(<CalendarTab />)
    await act(async () => {})

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    const event = makeTouchEvent(outside)
    Object.defineProperty(event, 'target', { value: outside, configurable: true })
    const preventSpy = jest.spyOn(event, 'preventDefault')

    await act(async () => {
      document.dispatchEvent(event)
    })

    expect(preventSpy).not.toHaveBeenCalled()
    document.body.removeChild(outside)
  })
})
