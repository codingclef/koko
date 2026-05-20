import { render, screen, fireEvent, act } from '@testing-library/react'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'

jest.mock('@/lib/calendar', () => ({
  getRecurrenceRule: jest.fn(),
  getReminders: jest.fn().mockResolvedValue([]),
  REMINDER_OPTIONS: [],
}))

const { getRecurrenceRule } = jest.requireMock('@/lib/calendar') as {
  getRecurrenceRule: jest.Mock
}

const defaultProps = {
  event: {
    id: 'evt-1',
    family_id: 'fam-1',
    calendar_id: 'cal-1',
    created_by: 'user-1',
    title: '회의',
    description: null,
    start_at: '2026-04-08T09:00:00.000Z',
    end_at: '2026-04-08T10:00:00.000Z',
    is_all_day: false,
    is_cancelled: false,
    label_color: null,
    series_id: null,
    series_occurrence_date: null,
    created_at: '',
    updated_at: '',
  },
  calendars: [
    {
      id: 'cal-1',
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '가족',
      color: '#f97316',
      created_at: '',
      updated_at: '',
    },
  ],
  onClose: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn().mockRejectedValue(new Error('delete failed')),
}

describe('EventDetailSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getRecurrenceRule.mockResolvedValue(null)
  })

  it('삭제 실패 시 에러 메시지를 표시하고 닫지 않는다', async () => {
    render(<EventDetailSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('일정 삭제'))

    await act(async () => {
      fireEvent.click(screen.getByText('삭제 확인'))
    })

    expect(await screen.findByText('삭제에 실패했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('반복 일정이면 반복 규칙과 종료 정보를 표시한다', async () => {
    getRecurrenceRule.mockResolvedValue({
      freq: 'weekly',
      interval: 1,
      daysOfWeek: [3],
    })

    render(
      <EventDetailSheet
        {...defaultProps}
        event={{
          ...defaultProps.event,
          series_id: 'series-1',
          series_occurrence_date: '2026-04-08',
        }}
      />
    )

    expect(await screen.findByText('반복 일정')).toBeInTheDocument()
    expect(screen.getByText('매주 수요일')).toBeInTheDocument()
    expect(screen.getByText('종료일 미설정 · 시작일 기준 1년 생성')).toBeInTheDocument()
  })

  it('메모 상세는 개행을 보존해서 표시한다', () => {
    const { container } = render(
      <EventDetailSheet
        {...defaultProps}
        event={{
          ...defaultProps.event,
          description: '첫 줄\n둘째 줄',
        }}
      />
    )

    const note = container.querySelector('.whitespace-pre-wrap') as HTMLElement
    expect(note.firstChild?.nodeValue).toBe('첫 줄\n둘째 줄')
    expect(note).toHaveClass('whitespace-pre-wrap')
    expect(note).toHaveClass('break-words')
  })
})
