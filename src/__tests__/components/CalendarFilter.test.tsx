import { render, screen, fireEvent, act } from '@testing-library/react'
import { CalendarFilter } from '@/components/calendar/CalendarFilter'
import type { Calendar } from '@/lib/calendar'

jest.useFakeTimers()

const calendars: Calendar[] = [
  { id: 'cal-1', family_id: 'fam-1', created_by: 'user-1', name: '테스트1', color: '#3b82f6', created_at: '', updated_at: '' },
  { id: 'cal-2', family_id: 'fam-1', created_by: 'user-1', name: '테스트2', color: '#22c55e', created_at: '', updated_at: '' },
]

const defaultProps = {
  calendars,
  activeIds: new Set<string>(),
  onToggle: jest.fn(),
  onAdd: jest.fn(),
  onEdit: jest.fn(),
}

describe('CalendarFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('캘린더 이름이 렌더링된다', () => {
    render(<CalendarFilter {...defaultProps} />)
    expect(screen.getByText('테스트1')).toBeInTheDocument()
    expect(screen.getByText('테스트2')).toBeInTheDocument()
  })

  it('짧게 누르면 onToggle이 호출된다', () => {
    render(<CalendarFilter {...defaultProps} />)
    const btn = screen.getByText('테스트1').closest('button')!
    fireEvent.mouseDown(btn)
    act(() => jest.advanceTimersByTime(100))
    fireEvent.mouseUp(btn)
    fireEvent.click(btn)
    expect(defaultProps.onToggle).toHaveBeenCalledWith('cal-1')
    expect(defaultProps.onEdit).not.toHaveBeenCalled()
  })

  it('길게 누르면 onEdit이 호출된다', () => {
    render(<CalendarFilter {...defaultProps} />)
    const btn = screen.getByText('테스트1').closest('button')!
    fireEvent.mouseDown(btn)
    act(() => jest.advanceTimersByTime(500))
    fireEvent.mouseUp(btn)
    fireEvent.click(btn)
    expect(defaultProps.onEdit).toHaveBeenCalledWith(calendars[0])
    expect(defaultProps.onToggle).not.toHaveBeenCalled()
  })

  it('길게 누르기 전 mouseLeave하면 onEdit이 호출되지 않는다', () => {
    render(<CalendarFilter {...defaultProps} />)
    const btn = screen.getByText('테스트1').closest('button')!
    fireEvent.mouseDown(btn)
    act(() => jest.advanceTimersByTime(200))
    fireEvent.mouseLeave(btn)
    act(() => jest.advanceTimersByTime(500))
    expect(defaultProps.onEdit).not.toHaveBeenCalled()
  })

  it('"+" 버튼 클릭 시 onAdd가 호출된다', () => {
    render(<CalendarFilter {...defaultProps} />)
    const addBtn = screen.getByRole('button', { name: '' })
    // Plus icon button has no text, but it's the last button
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])
    expect(defaultProps.onAdd).toHaveBeenCalled()
  })
})
