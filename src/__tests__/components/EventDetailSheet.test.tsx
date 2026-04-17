import { render, screen, fireEvent, act } from '@testing-library/react'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'

jest.mock('@/lib/calendar', () => ({
  getReminders: jest.fn().mockResolvedValue([]),
  REMINDER_OPTIONS: [],
}))

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
})
