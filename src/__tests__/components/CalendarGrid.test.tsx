import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import type { Calendar, CalendarEvent } from '@/lib/calendar'

const calendars: Calendar[] = [
  { id: 'cal-1', family_id: 'fam-1', created_by: 'user-1', name: '가족', color: '#f97316', created_at: '' },
]

const events: CalendarEvent[] = [
  {
    id: 'evt-1',
    family_id: 'fam-1',
    calendar_id: 'cal-1',
    created_by: 'user-1',
    title: '생일파티',
    description: null,
    start_at: '2025-06-15T10:00:00Z',
    end_at: null,
    is_all_day: false,
    created_at: '',
    updated_at: '',
  },
]

const defaultProps = {
  year: 2025,
  month: 5, // June (0-indexed)
  events,
  calendars,
  activeIds: new Set<string>(),
  selectedDate: null,
  onSelectDate: jest.fn(),
}

describe('CalendarGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('날짜 클릭 시 onSelectDate가 호출된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    const dayCells = screen.getAllByRole('button')
    fireEvent.click(dayCells[0])
    expect(defaultProps.onSelectDate).toHaveBeenCalledTimes(1)
  })

  it('onSelectEvent 없을 때 이벤트 pill이 role=button 없이 렌더링된다', () => {
    render(<CalendarGrid {...defaultProps} />)
    expect(screen.getByText('생일파티')).toBeInTheDocument()
    expect(screen.getByText('생일파티')).not.toHaveAttribute('role', 'button')
  })

  it('onSelectEvent 있을 때 이벤트 pill이 role=button으로 렌더링된다', () => {
    const onSelectEvent = jest.fn()
    render(<CalendarGrid {...defaultProps} onSelectEvent={onSelectEvent} />)
    const pill = screen.getByText('생일파티')
    expect(pill).toHaveAttribute('role', 'button')
  })

  it('이벤트 pill 클릭 시 onSelectEvent가 해당 이벤트로 호출된다', () => {
    const onSelectEvent = jest.fn()
    render(<CalendarGrid {...defaultProps} onSelectEvent={onSelectEvent} />)
    fireEvent.click(screen.getByText('생일파티'))
    expect(onSelectEvent).toHaveBeenCalledWith(events[0])
  })

  it('이벤트 pill 클릭 시 onSelectDate는 호출되지 않는다', () => {
    const onSelectEvent = jest.fn()
    render(<CalendarGrid {...defaultProps} onSelectEvent={onSelectEvent} />)
    fireEvent.click(screen.getByText('생일파티'))
    expect(defaultProps.onSelectDate).not.toHaveBeenCalled()
  })
})
