import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { ReminderTab, clearReminderTabCache } from '@/components/tabs/ReminderTab'

const mockCreateReminderList = jest.fn()
const mockGetReminderGroups = jest.fn()
const mockCreateReminderGroup = jest.fn()
const mockUpdateReminderGroup = jest.fn()
const mockDeleteReminderGroup = jest.fn()
const mockSetReminderGroupMembers = jest.fn()
const mockGetFamilyMembers = jest.fn()
const mockGetReminderListsWithPreviews = jest.fn()
const mockDeleteReminderList = jest.fn()
const mockRenameReminderList = jest.fn()
const mockReorderReminderLists = jest.fn()
const mockBroadcast = jest.fn()
const mockUseRealtimeSync = jest.fn((...args: unknown[]) => {
  void args
  return mockBroadcast
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockListParam: string | null = null
let mockDndOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

jest.mock('@/lib/reminder-lists', () => ({
  getReminderGroups: (...args: unknown[]) => mockGetReminderGroups(...args),
  createReminderGroup: (...args: unknown[]) => mockCreateReminderGroup(...args),
  updateReminderGroup: (...args: unknown[]) => mockUpdateReminderGroup(...args),
  deleteReminderGroup: (...args: unknown[]) => mockDeleteReminderGroup(...args),
  setReminderGroupMembers: (...args: unknown[]) => mockSetReminderGroupMembers(...args),
  getReminderListsWithPreviews: (...args: unknown[]) => mockGetReminderListsWithPreviews(...args),
  createReminderList: (...args: unknown[]) => mockCreateReminderList(...args),
  deleteReminderList: (...args: unknown[]) => mockDeleteReminderList(...args),
  renameReminderList: (...args: unknown[]) => mockRenameReminderList(...args),
  reorderReminderLists: (...args: unknown[]) => mockReorderReminderLists(...args),
}))

jest.mock('@/lib/calendar', () => ({
  getFamilyMembers: (...args: unknown[]) => mockGetFamilyMembers(...args),
}))

jest.mock('@/components/reminders/ReminderGroupListSheet', () => ({
  ReminderGroupListSheet: ({
    groups,
    familyMembers,
    onClose,
  }: {
    groups: Array<{ id: string; name: string }>
    familyMembers: Array<{ user_id: string }>
    onClose: () => void
  }) => (
    <div>
      <p>groups:{groups.length}</p>
      <p>members:{familyMembers.length}</p>
      <button onClick={onClose}>close-groups</button>
    </div>
  ),
}))

jest.mock('@/hooks/useRealtimeSync', () => ({
  useRealtimeSync: (channelName: unknown, refresh: unknown, options: unknown) =>
    mockUseRealtimeSync(channelName, refresh, options),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'list' ? mockListParam : null),
  }),
}))

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: (event: { active: { id: string }; over: { id: string } | null }) => void
  }) => {
    mockDndOnDragEnd = onDragEnd
    return <>{children}</>
  },
  PointerSensor: class {},
  TouchSensor: class {},
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: jest.fn((items: unknown[], oldIndex: number, newIndex: number) => {
    const next = [...items]
    const [item] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, item)
    return next
  }),
  rectSortingStrategy: {},
}))

jest.mock('@/components/reminders/ReminderListCard', () => ({
  ReminderListCard: ({
    list,
    onOpen,
  }: {
    list: { id: string; name: string }
    onOpen: (listId: string) => void
  }) => <button onClick={() => onOpen(list.id)}>{list.name}</button>,
}))

jest.mock('@/components/reminders/ReminderDetailView', () => ({
  ReminderDetailView: ({
    listId,
    onClose,
  }: {
    listId: string
    onClose: () => void
  }) => (
    <div>
      <p>detail:{listId}</p>
      <button onClick={onClose}>close-detail</button>
    </div>
  ),
}))

describe('ReminderTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearReminderTabCache()
    mockListParam = null
    mockDndOnDragEnd = null
    mockGetReminderListsWithPreviews.mockResolvedValue([])
    mockGetReminderGroups.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
    mockCreateReminderGroup.mockResolvedValue({ id: 'group-1' })
    mockUpdateReminderGroup.mockResolvedValue(undefined)
    mockDeleteReminderGroup.mockResolvedValue(undefined)
    mockSetReminderGroupMembers.mockResolvedValue(undefined)
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('refreshOnSubscribed: false를 전달하지 않는다', async () => {
    render(
      <ReminderTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )
    await act(async () => {})
    const calls = mockUseRealtimeSync.mock.calls as unknown as Array<[unknown, unknown, { refreshOnSubscribed?: boolean } | undefined]>
    const options = calls[0]?.[2]
    expect(options?.refreshOnSubscribed).not.toBe(false)
  })

  it('realtime refresh에서 목록과 그룹을 함께 다시 읽는다', async () => {
    render(
      <ReminderTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )

    await act(async () => {})
    const calls = mockUseRealtimeSync.mock.calls as unknown as Array<[unknown, () => void, unknown]>
    const refreshCallback = calls[0]?.[1]
    mockGetReminderListsWithPreviews.mockClear()
    mockGetReminderGroups.mockClear()
    mockGetFamilyMembers.mockClear()

    await act(async () => {
      refreshCallback()
    })

    expect(mockGetReminderListsWithPreviews).toHaveBeenCalledWith('fam-1')
    expect(mockGetReminderGroups).toHaveBeenCalledWith('fam-1')
    expect(mockGetFamilyMembers).toHaveBeenCalledWith('fam-1')
  })

  it('상단 여백을 다른 탭과 같은 압축 기준으로 사용한다', async () => {
    render(
      <ReminderTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )
    await act(async () => {})
    const container = screen.getByTestId('reminder-tab-container')
    expect(container.className).toContain('pt-2')
    expect(container.className).not.toContain('py-8')
  })

  it('목록 생성 실패 시 optimistic 항목을 롤백하고 에러를 표시한다', async () => {
    const user = userEvent.setup()
    mockCreateReminderList.mockRejectedValueOnce(new Error('insert failed'))
    const mockUser = { id: 'user-1' } as User

    render(
      <ReminderTab
        user={mockUser}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    await user.click(await screen.findByLabelText('새 리마인더 추가'))
    await user.type(screen.getByPlaceholderText('예: 이마트, 코스트코'), '이마트')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(screen.getByText('목록을 저장하지 못했어요')).toBeInTheDocument()
    })

    expect(screen.queryByText('이마트')).not.toBeInTheDocument()
  })

  it('familyId가 바뀌면 이전 가족의 캐시 목록을 보여주지 않는다', async () => {
    const mockUser = { id: 'user-1' } as User
    mockGetReminderListsWithPreviews
      .mockResolvedValueOnce([
        {
          id: 'list-1',
          family_id: 'fam-1',
          created_by: 'user-1',
          name: '첫째 가족 목록',
          reminder_group_id: null,
          type: 'strikethrough',
          sort_order: 0,
          created_at: '2026-01-01T00:00:00Z',
          previewItems: [],
        },
      ])
      .mockRejectedValueOnce(new Error('fetch failed'))

    const { rerender } = render(
      <ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />
    )

    expect(await screen.findByText('첫째 가족 목록')).toBeInTheDocument()

    rerender(<ReminderTab user={mockUser} familyId="fam-2" isInitializing={false} />)

    await waitFor(() => {
      expect(screen.getByText('목록을 불러오지 못했어요')).toBeInTheDocument()
    })

    expect(screen.queryByText('첫째 가족 목록')).not.toBeInTheDocument()
  })

  it('목록 카드 열기 시 canonical reminder detail URL로 push한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User

    mockGetReminderListsWithPreviews.mockResolvedValueOnce([
      {
        id: 'list-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '이마트',
        reminder_group_id: null,
        type: 'strikethrough',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByRole('button', { name: '이마트' }))

    expect(mockPush).toHaveBeenCalledWith('/calendar?tab=reminders&list=list-1', { scroll: false })
  })

  it('list 쿼리가 있으면 상세를 열고 닫기 시 reminder 리스트 URL로 replace한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockListParam = 'list-1'

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    expect(await screen.findByText('detail:list-1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close-detail' }))

    expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=reminders', { scroll: false })
  })

  it('리마인더 그룹 관리 시트를 연다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockGetReminderGroups.mockResolvedValueOnce([
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
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByLabelText('리마인더 그룹 관리'))

    expect(await screen.findByText('groups:1')).toBeInTheDocument()
  })

  it('그룹 필터를 선택하면 해당 그룹 목록만 보여준다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockGetReminderGroups.mockResolvedValueOnce([
      {
        id: 'group-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인',
        color: '#3b82f6',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    mockGetReminderListsWithPreviews.mockResolvedValueOnce([
      {
        id: 'list-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족 목록',
        reminder_group_id: null,
        type: 'strikethrough',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'list-2',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인 목록',
        reminder_group_id: 'group-1',
        type: 'strikethrough',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    expect(await screen.findByRole('button', { name: '가족 목록' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '개인 목록' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '개인' }))

    expect(screen.queryByRole('button', { name: '가족 목록' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '개인 목록' })).toBeInTheDocument()
  })

  it('필터 상태에서 정렬하면 보이는 목록끼리만 순서를 바꾸고 숨겨진 목록 위치는 유지한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockReorderReminderLists.mockResolvedValueOnce(undefined)
    mockGetReminderGroups.mockResolvedValueOnce([
      {
        id: 'group-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인',
        color: '#3b82f6',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    mockGetReminderListsWithPreviews.mockResolvedValueOnce([
      {
        id: 'family-a',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족 A',
        reminder_group_id: null,
        type: 'strikethrough',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'group-a',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인 A',
        reminder_group_id: 'group-1',
        type: 'strikethrough',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'family-b',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족 B',
        reminder_group_id: null,
        type: 'strikethrough',
        sort_order: 2,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByRole('button', { name: '가족 전체' }))

    await act(async () => {
      mockDndOnDragEnd?.({
        active: { id: 'family-b' },
        over: { id: 'family-a' },
      })
    })

    expect(mockReorderReminderLists).toHaveBeenCalledWith([
      { id: 'family-b', sort_order: 0 },
      { id: 'group-a', sort_order: 1 },
      { id: 'family-a', sort_order: 2 },
    ])
  })

  it('특정 그룹 필터에서도 해당 그룹 목록끼리만 순서를 바꾼다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockReorderReminderLists.mockResolvedValueOnce(undefined)
    mockGetReminderGroups.mockResolvedValueOnce([
      {
        id: 'group-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인',
        color: '#3b82f6',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'group-2',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '회사',
        color: '#22c55e',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    mockGetReminderListsWithPreviews.mockResolvedValueOnce([
      {
        id: 'family-a',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '가족 A',
        reminder_group_id: null,
        type: 'strikethrough',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'group-a',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인 A',
        reminder_group_id: 'group-1',
        type: 'strikethrough',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'other-group',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '회사 A',
        reminder_group_id: 'group-2',
        type: 'strikethrough',
        sort_order: 2,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
      {
        id: 'group-b',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인 B',
        reminder_group_id: 'group-1',
        type: 'strikethrough',
        sort_order: 3,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByRole('button', { name: '개인' }))

    await act(async () => {
      mockDndOnDragEnd?.({
        active: { id: 'group-b' },
        over: { id: 'group-a' },
      })
    })

    expect(mockReorderReminderLists).toHaveBeenCalledWith([
      { id: 'family-a', sort_order: 0 },
      { id: 'group-b', sort_order: 1 },
      { id: 'other-group', sort_order: 2 },
      { id: 'group-a', sort_order: 3 },
    ])
  })

  it('그룹을 선택해 리마인더를 만들면 생성 API에 그룹 id를 전달한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockGetReminderGroups.mockResolvedValueOnce([
      {
        id: 'group-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '개인',
        color: '#3b82f6',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    mockCreateReminderList.mockResolvedValueOnce({
      id: 'list-1',
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '이마트',
      reminder_group_id: 'group-1',
      type: 'strikethrough',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    })

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByLabelText('새 리마인더 추가'))
    await user.type(screen.getByPlaceholderText('예: 이마트, 코스트코'), '이마트')
    await user.click(screen.getAllByRole('button', { name: '개인' })[1])
    await user.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(mockCreateReminderList).toHaveBeenCalledWith(
        'fam-1',
        'user-1',
        '이마트',
        'strikethrough',
        'group-1'
      )
    })
  })

  it('그룹 조회가 실패해도 가족 멤버는 그룹 시트에 전달한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockGetReminderGroups.mockRejectedValueOnce(new Error('groups failed'))
    mockGetFamilyMembers.mockResolvedValueOnce([
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
    ])

    render(<ReminderTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByLabelText('리마인더 그룹 관리'))

    expect(await screen.findByText('members:2')).toBeInTheDocument()
  })
})
