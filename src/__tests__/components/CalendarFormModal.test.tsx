import { render, screen, fireEvent, act } from '@testing-library/react'
import { CalendarFormModal } from '@/components/calendar/CalendarFormModal'

jest.mock('@/lib/calendar', () => ({
  CALENDAR_COLORS: ['#f97316', '#3b82f6'],
}))

const defaultProps = {
  familyMembers: [
    {
      id: 'fm-1',
      family_id: 'fam-1',
      user_id: 'user-1',
      display_name: '나',
      role: 'member',
      created_at: '',
    },
    {
      id: 'fm-2',
      family_id: 'fam-1',
      user_id: 'user-2',
      display_name: '가족',
      role: 'member',
      created_at: '',
    },
  ],
  currentUserId: 'user-1',
  onClose: jest.fn(),
  onSave: jest.fn().mockResolvedValue(undefined),
  onDelete: jest.fn().mockRejectedValue(new Error('delete failed')),
}

describe('CalendarFormModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('삭제 실패 시 에러 메시지를 표시하고 닫지 않는다', async () => {
    render(
      <CalendarFormModal
        {...defaultProps}
        initial={{
          id: 'cal-1',
          family_id: 'fam-1',
          created_by: 'user-1',
          name: '가족',
          color: '#f97316',
          created_at: '',
          updated_at: '',
        }}
        initialMemberIds={['user-1', 'user-2']}
      />
    )

    fireEvent.click(screen.getByText('삭제'))

    await act(async () => {
      fireEvent.click(screen.getByText('정말 삭제'))
    })

    expect(await screen.findByText('삭제에 실패했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })
})
