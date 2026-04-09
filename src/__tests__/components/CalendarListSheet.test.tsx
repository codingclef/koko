import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CalendarListSheet } from '@/components/calendar/CalendarListSheet'
import type { Calendar, FamilyMember } from '@/lib/calendar'

jest.mock('@/lib/calendar', () => ({
  getCalendarMembers: jest.fn().mockResolvedValue([]),
  getCalendarMembersForCalendars: jest.fn().mockResolvedValue([]),
  CALENDAR_COLORS: ['#f97316'],
  CALENDAR_COLOR_NAMES: { '#f97316': '주황색' },
}))

jest.mock('@/components/calendar/CalendarDetailScreen', () => ({
  CalendarDetailScreen: ({
    onBack,
    onSave,
  }: {
    onBack: () => void
    onSave: (id: string, name: string, color: string, memberIds: string[] | null) => Promise<{ status: string }>
  }) => (
    <div data-testid="calendar-detail">
      <button onClick={onBack}>뒤로</button>
      {/* 실제 컴포넌트처럼 save 후 onBack 호출 */}
      <button onClick={() => onSave('cal-1', '가족', '#f97316', null).then(onBack)}>저장(null멤버)</button>
      <button onClick={() => onSave('cal-1', '가족', '#f97316', []).then(onBack)}>저장(빈멤버)</button>
    </div>
  ),
}))

const mockCalendars: Calendar[] = [{
  id: 'cal-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  name: '가족',
  color: '#f97316',
  created_at: '',
  updated_at: '',
}]

const defaultProps = {
  calendars: mockCalendars,
  familyMembers: [] as FamilyMember[],
  currentUserId: 'user-1',
  onClose: jest.fn(),
  onAdd: jest.fn(),
  onSave: jest.fn().mockResolvedValue({ status: 'success' }),
  onDelete: jest.fn(),
}

describe('CalendarListSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    defaultProps.onSave.mockResolvedValue({ status: 'success' })
  })

  it('캘린더 클릭 시 상세 뷰로 진입', async () => {
    render(<CalendarListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('가족'))

    expect(await screen.findByTestId('calendar-detail')).toBeInTheDocument()
  })

  it('뒤로 클릭 시 리스트 뷰로 복귀', async () => {
    render(<CalendarListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('가족'))
    await screen.findByTestId('calendar-detail')

    fireEvent.click(screen.getByText('뒤로'))

    expect(screen.queryByTestId('calendar-detail')).not.toBeInTheDocument()
    expect(screen.getByText('가족')).toBeInTheDocument()
  })

  it('새로운 캘린더 만들기 클릭 시 onAdd 호출', () => {
    render(<CalendarListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('새로운 캘린더 만들기'))

    expect(defaultProps.onAdd).toHaveBeenCalled()
  })

  it('onSave가 partial 반환 시 리스트 뷰에 경고 배너 표시', async () => {
    defaultProps.onSave.mockResolvedValue({ status: 'partial' })

    render(<CalendarListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('가족'))
    await screen.findByTestId('calendar-detail')

    fireEvent.click(screen.getByText('저장(빈멤버)'))

    await waitFor(() => {
      expect(screen.getByText('캘린더 정보는 저장됐지만 멤버는 저장하지 못했어요')).toBeInTheDocument()
    })
  })
})
