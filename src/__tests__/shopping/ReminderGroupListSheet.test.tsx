import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReminderGroupListSheet } from '@/components/shopping/ReminderGroupListSheet'
import type { ReminderGroup, ReminderGroupMember } from '@/lib/shopping'
import type { FamilyMember } from '@/lib/calendar'

const mockGetReminderGroupMembers = jest.fn()
const mockGetReminderGroupMembersForGroups = jest.fn()

jest.mock('@/lib/shopping', () => ({
  getReminderGroupMembers: (...args: unknown[]) => mockGetReminderGroupMembers(...args),
  getReminderGroupMembersForGroups: (...args: unknown[]) => mockGetReminderGroupMembersForGroups(...args),
  REMINDER_GROUP_COLORS: ['#3b82f6', '#22c55e'],
  REMINDER_GROUP_COLOR_NAMES: {
    '#3b82f6': '파란색',
    '#22c55e': '초록색',
  },
}))

const groups: ReminderGroup[] = [
  {
    id: 'group-1',
    family_id: 'fam-1',
    created_by: 'user-1',
    name: '집',
    color: '#3b82f6',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const familyMembers: FamilyMember[] = [
  {
    id: 'member-1',
    family_id: 'fam-1',
    user_id: 'user-1',
    display_name: '나',
    role: 'admin',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-2',
    family_id: 'fam-1',
    user_id: 'user-2',
    display_name: '엄마',
    role: 'member',
    created_at: '2026-01-01T00:00:00Z',
  },
]

const groupMembers: ReminderGroupMember[] = [
  {
    reminder_group_id: 'group-1',
    user_id: 'user-1',
    role: 'owner',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    reminder_group_id: 'group-1',
    user_id: 'user-2',
    role: 'member',
    created_at: '2026-01-01T00:00:00Z',
  },
]

const defaultProps = {
  groups,
  familyMembers,
  currentUserId: 'user-1',
  onClose: jest.fn(),
  onCreate: jest.fn().mockResolvedValue(undefined),
  onSave: jest.fn().mockResolvedValue({ status: 'success' }),
  onDelete: jest.fn().mockResolvedValue(undefined),
}

describe('ReminderGroupListSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetReminderGroupMembers.mockResolvedValue(groupMembers)
    mockGetReminderGroupMembersForGroups.mockResolvedValue(groupMembers)
    defaultProps.onCreate.mockResolvedValue(undefined)
    defaultProps.onSave.mockResolvedValue({ status: 'success' })
    defaultProps.onDelete.mockResolvedValue(undefined)
  })

  it('그룹 목록을 렌더링한다', async () => {
    render(<ReminderGroupListSheet {...defaultProps} />)

    expect(screen.getByText('리마인더 그룹')).toBeInTheDocument()
    expect(screen.getByText('집')).toBeInTheDocument()
    expect(await screen.findByText('엄')).toBeInTheDocument()
  })

  it('새로운 그룹 만들기에서 그룹을 생성한다', async () => {
    const user = userEvent.setup()
    render(<ReminderGroupListSheet {...defaultProps} />)

    await user.click(screen.getByText('새로운 그룹 만들기'))
    await user.type(screen.getByPlaceholderText('그룹 이름'), '회사')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith('회사', '#22c55e', ['user-2'])
    })
  })

  it('새 그룹에서 멤버가 늦게 로드되면 기본 선택을 가족 전체로 갱신한다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ReminderGroupListSheet
        {...defaultProps}
        groups={[]}
        familyMembers={[]}
      />
    )

    await user.click(screen.getByText('새로운 그룹 만들기'))

    rerender(
      <ReminderGroupListSheet
        {...defaultProps}
        groups={[]}
        familyMembers={familyMembers}
      />
    )

    await user.type(screen.getByPlaceholderText('그룹 이름'), '회사')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith('회사', '#22c55e', ['user-2'])
    })
  })

  it('새 그룹에서 사용자가 멤버 선택을 바꾼 뒤에는 기본 선택을 덮어쓰지 않는다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ReminderGroupListSheet
        {...defaultProps}
        groups={[]}
        familyMembers={familyMembers}
      />
    )

    await user.click(screen.getByText('새로운 그룹 만들기'))
    await user.click(screen.getByRole('checkbox', { name: '엄마' }))

    rerender(
      <ReminderGroupListSheet
        {...defaultProps}
        groups={[]}
        familyMembers={familyMembers}
      />
    )

    await user.type(screen.getByPlaceholderText('그룹 이름'), '회사')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith('회사', '#22c55e', [])
    })
  })

  it('기존 그룹 저장 시 변경 값을 전달한다', async () => {
    const user = userEvent.setup()
    render(<ReminderGroupListSheet {...defaultProps} />)

    await user.click(screen.getByText('집'))
    const input = await screen.findByDisplayValue('집')
    await user.clear(input)
    await user.type(input, '개인')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith('group-1', '개인', '#3b82f6', ['user-2'])
    })
  })

  it('삭제 확인 후 그룹 삭제를 호출한다', async () => {
    render(<ReminderGroupListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('집'))
    expect(await screen.findByText('그룹 삭제')).toBeInTheDocument()

    fireEvent.click(screen.getByText('그룹 삭제'))
    fireEvent.click(screen.getByText('삭제 확인'))

    await waitFor(() => {
      expect(defaultProps.onDelete).toHaveBeenCalledWith('group-1')
    })
  })

  it('그룹 삭제 실패 시 리마인더가 있으면 삭제할 수 없다는 안내를 표시한다', async () => {
    defaultProps.onDelete.mockRejectedValueOnce(new Error('delete restricted'))
    render(<ReminderGroupListSheet {...defaultProps} />)

    fireEvent.click(screen.getByText('집'))
    expect(await screen.findByText('그룹 삭제')).toBeInTheDocument()

    fireEvent.click(screen.getByText('그룹 삭제'))
    fireEvent.click(screen.getByText('삭제 확인'))

    expect(
      await screen.findByText('그룹에 포함된 리마인더가 있으면 삭제할 수 없어요.')
    ).toBeInTheDocument()
  })
})
