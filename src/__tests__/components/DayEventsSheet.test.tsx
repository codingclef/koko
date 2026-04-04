import { render, screen, fireEvent } from '@testing-library/react'
import { DayEventsSheet } from '@/components/calendar/DayEventsSheet'
import type { Calendar, CalendarEvent } from '@/lib/calendar'

const calendars: Calendar[] = [
  { id: 'cal-1', family_id: 'fam-1', created_by: 'user-1', name: 'JGBB', color: '#22c55e', created_at: '', updated_at: '' },
]

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    family_id: 'fam-1',
    calendar_id: 'cal-1',
    created_by: 'user-1',
    created_at: '',
    updated_at: '',
    title: '테스트 일정',
    description: null,
    start_at: '2026-04-13T09:00:00',
    end_at: null,
    is_all_day: false,
    ...overrides,
  }
}

const defaultProps = {
  date: new Date('2026-04-13'),
  calendars,
  onClose: jest.fn(),
  onSelectEvent: jest.fn(),
  onAddEvent: jest.fn(),
}

describe('DayEventsSheet', () => {
  beforeEach(() => jest.clearAllMocks())

  it('종일 일정은 "종일"로 표시된다', () => {
    render(<DayEventsSheet {...defaultProps} events={[makeEvent({ is_all_day: true })]} />)
    expect(screen.getByText(/종일/)).toBeInTheDocument()
  })

  it('end_at이 없는 비종일 일정은 시작시간만 표시된다', () => {
    render(<DayEventsSheet {...defaultProps} events={[makeEvent({ end_at: null })]} />)
    expect(screen.getByText(/09:00/)).toBeInTheDocument()
    expect(screen.queryByText(/~/)).not.toBeInTheDocument()
  })

  it('end_at이 있는 비종일 일정은 시작~종료 형식으로 표시된다', () => {
    render(
      <DayEventsSheet
        {...defaultProps}
        events={[makeEvent({ end_at: '2026-04-13T10:30:00' })]}
      />
    )
    expect(screen.getByText(/09:00~10:30/)).toBeInTheDocument()
  })

  it('description이 있으면 미리보기가 렌더링된다', () => {
    render(
      <DayEventsSheet
        {...defaultProps}
        events={[makeEvent({ description: '회의 준비물 챙기기' })]}
      />
    )
    expect(screen.getByText('회의 준비물 챙기기')).toBeInTheDocument()
  })

  it('description이 null이면 미리보기가 렌더링되지 않는다', () => {
    render(<DayEventsSheet {...defaultProps} events={[makeEvent({ description: null })]} />)
    // title만 있고 description 관련 요소 없음
    expect(screen.getByText('테스트 일정')).toBeInTheDocument()
    expect(screen.queryByText('회의')).not.toBeInTheDocument()
  })

  it('해당 날짜의 일정이 없으면 빈 상태 메시지를 표시한다', () => {
    render(<DayEventsSheet {...defaultProps} events={[]} />)
    expect(screen.getByText('이 날의 일정이 없어요')).toBeInTheDocument()
  })

  it('닫기 버튼 클릭 시 onClose가 호출된다', () => {
    render(<DayEventsSheet {...defaultProps} events={[]} />)
    const closeBtn = screen.getByRole('button', { name: '' })
    // X 버튼은 lucide icon만 있음 — 마지막 버튼
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('일정 클릭 시 onSelectEvent가 호출된다', () => {
    const evt = makeEvent()
    render(<DayEventsSheet {...defaultProps} events={[evt]} />)
    fireEvent.click(screen.getByText('테스트 일정'))
    expect(defaultProps.onSelectEvent).toHaveBeenCalledWith(evt)
  })

  it('일정 추가 버튼 클릭 시 onAddEvent가 호출된다', () => {
    render(<DayEventsSheet {...defaultProps} events={[]} />)
    fireEvent.click(screen.getByText('일정 추가'))
    expect(defaultProps.onAddEvent).toHaveBeenCalled()
  })
})
