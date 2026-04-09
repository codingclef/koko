import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CalendarDetailScreen } from '@/components/calendar/CalendarDetailScreen'
import type { Calendar, FamilyMember } from '@/lib/calendar'

jest.mock('@/lib/calendar', () => ({
  CALENDAR_COLORS: ['#f97316'],
  CALENDAR_COLOR_NAMES: { '#f97316': '주황색' },
}))

const mockCalendar: Calendar = {
  id: 'cal-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  name: '가족',
  color: '#f97316',
  created_at: '',
  updated_at: '',
}

const otherMember: FamilyMember = {
  id: 'fm-2',
  user_id: 'user-2',
  family_id: 'fam-1',
  display_name: '엄마',
  role: 'member',
  created_at: '',
}

const defaultProps = {
  calendar: mockCalendar,
  familyMembers: [otherMember],
  currentUserId: 'user-1',
  onBack: jest.fn(),
  onSave: jest.fn(),
  onDelete: jest.fn(),
}

describe('CalendarDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('멤버 로드 실패(memberLoadError) 시 onSave에 null 전달', async () => {
    defaultProps.onSave.mockResolvedValue({ status: 'success' })

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={null}
        memberLoadError={true}
      />
    )

    fireEvent.click(screen.getByText('저장'))

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith('cal-1', '가족', '#f97316', null)
    })
  })

  it('멤버 로딩 중(memberIds null, 에러 없음) 시 저장 버튼 비활성화', () => {
    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={null}
        memberLoadError={false}
      />
    )

    expect(screen.getByText('저장').closest('button')).toBeDisabled()
  })

  it('onSave가 success 반환 시 onBack 호출', async () => {
    defaultProps.onSave.mockResolvedValue({ status: 'success' })

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={['user-1']}
        memberLoadError={false}
      />
    )

    fireEvent.click(screen.getByText('저장'))

    await waitFor(() => {
      expect(defaultProps.onBack).toHaveBeenCalled()
    })
  })

  it('onSave가 partial 반환 시 onBack 호출', async () => {
    defaultProps.onSave.mockResolvedValue({ status: 'partial' })

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={['user-1']}
        memberLoadError={false}
      />
    )

    fireEvent.click(screen.getByText('저장'))

    await waitFor(() => {
      expect(defaultProps.onBack).toHaveBeenCalled()
    })
  })

  it('onSave가 throw 시 화면 유지 + 에러 표시', async () => {
    defaultProps.onSave.mockRejectedValue(new Error('save failed'))

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={['user-1']}
        memberLoadError={false}
      />
    )

    fireEvent.click(screen.getByText('저장'))

    await waitFor(() => {
      expect(screen.getByText('저장에 실패했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    })
    expect(defaultProps.onBack).not.toHaveBeenCalled()
  })

  it('삭제 성공 시 onBack 호출', async () => {
    defaultProps.onDelete.mockResolvedValue(undefined)

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={['user-1']}
        memberLoadError={false}
      />
    )

    fireEvent.click(screen.getByText('캘린더 삭제'))
    fireEvent.click(screen.getByText('정말 삭제'))

    await waitFor(() => {
      expect(defaultProps.onBack).toHaveBeenCalled()
    })
  })

  it('삭제 실패 시 화면 유지 + 에러 표시', async () => {
    defaultProps.onDelete.mockRejectedValue(new Error('delete failed'))

    render(
      <CalendarDetailScreen
        {...defaultProps}
        memberIds={['user-1']}
        memberLoadError={false}
      />
    )

    fireEvent.click(screen.getByText('캘린더 삭제'))
    fireEvent.click(screen.getByText('정말 삭제'))

    await waitFor(() => {
      expect(screen.getByText('삭제에 실패했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    })
    expect(defaultProps.onBack).not.toHaveBeenCalled()
  })
})
