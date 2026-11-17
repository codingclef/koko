import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { ReminderItem } from '@/lib/reminder-lists'
import { ReminderTab, clearReminderTabCache } from '@/components/tabs/ReminderTab'

const mockCreateReminderList = jest.fn()
const mockGetReminderGroups = jest.fn()
const mockCreateReminderGroup = jest.fn()
const mockUpdateReminderGroup = jest.fn()
const mockDeleteReminderGroup = jest.fn()
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
let mockPendingPreview: Promise<ReminderItem[]> | null = null
let mockPreviewItems: ReminderItem[] = []
let mockDndOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

jest.mock('@/lib/reminder-lists', () => ({
  getReminderGroups: (...args: unknown[]) => mockGetReminderGroups(...args),
  createReminderGroup: (...args: unknown[]) => mockCreateReminderGroup(...args),
  updateReminderGroup: (...args: unknown[]) => mockUpdateReminderGroup(...args),
  deleteReminderGroup: (...args: unknown[]) => mockDeleteReminderGroup(...args),
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
    previewItems,
  }: {
    list: { id: string; name: string }
    onOpen: (listId: string) => void
    previewItems: { id: string; name: string }[]
  }) => (
    <div>
      <button onClick={() => onOpen(list.id)}>{list.name}</button>
      {previewItems.map((item) => <span key={item.id}>{item.name}</span>)}
    </div>
  ),
}))

jest.mock('@/components/reminders/ReminderDetailView', () => ({
  ReminderDetailView: ({
    listId,
    onClose,
    listRefreshVersion,
    onListSaved,
    nextPreviewReadOrder,
    onItemsSettledAfterClose,
    onPreviewItemsChange,
  }: {
    listId: string
    onClose: () => void
    listRefreshVersion: number
    onListSaved: () => void
    nextPreviewReadOrder: () => number
    onItemsSettledAfterClose: (listId: string, read: { order: number; items: Promise<ReminderItem[]> }) => void
    onPreviewItemsChange: (listId: string, items: ReminderItem[], order: number) => void
  }) => (
    <div>
      <p>detail:{listId}</p>
      <output data-testid="detail-refresh-version">{listRefreshVersion}</output>
      <button onClick={() => {
        if (mockPendingPreview) {
          onItemsSettledAfterClose(listId, { order: nextPreviewReadOrder(), items: mockPendingPreview })
        }
        onClose()
      }}>close-detail</button>
      <button onClick={onListSaved}>save-detail-group</button>
      <button onClick={() => onPreviewItemsChange(listId, mockPreviewItems, nextPreviewReadOrder())}>publish-preview</button>
    </div>
  ),
}))

describe('ReminderTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearReminderTabCache()
    mockListParam = null
    mockPendingPreview = null
    mockPreviewItems = []
    mockDndOnDragEnd = null
    mockGetReminderListsWithPreviews.mockResolvedValue([])
    mockGetReminderGroups.mockResolvedValue([])
    mockGetFamilyMembers.mockResolvedValue([])
    mockCreateReminderGroup.mockResolvedValue({ id: 'group-1' })
    mockUpdateReminderGroup.mockResolvedValue(undefined)
    mockDeleteReminderGroup.mockResolvedValue(undefined)
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

  it('늦게 도착한 초기 조회로 최신 목록을 덮어쓰지 않는다', async () => {
    const list = {
      id: 'list-1', family_id: 'fam-1', created_by: 'user-1',
      reminder_group_id: null, type: 'strikethrough', sort_order: 0,
      created_at: '2026-01-01T00:00:00Z', previewItems: [],
    }
    let finishInitial!: (lists: unknown[]) => void
    mockGetReminderListsWithPreviews
      .mockReturnValueOnce(new Promise(resolve => { finishInitial = resolve }))
      .mockResolvedValueOnce([{ ...list, name: '최신 목록' }])

    render(<ReminderTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />)
    const refresh = mockUseRealtimeSync.mock.calls[0][1] as () => void
    await act(async () => { refresh() })
    expect(screen.getByText('최신 목록')).toBeInTheDocument()
    await act(async () => { finishInitial([{ ...list, name: '이전 목록' }]) })
    expect(screen.getByText('최신 목록')).toBeInTheDocument()
    expect(screen.queryByText('이전 목록')).not.toBeInTheDocument()
  })

  it('상단 여백을 다른 탭과 같은 압축 기준으로 사용한다', async () => {
    render(
      <ReminderTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )
    await act(async () => {})
    const container = screen.getByTestId('reminder-tab-container')
    expect(container.className).toContain('pt-2')
    expect(container.className).toContain('min-h-full')
    expect(container.className).not.toContain('min-h-screen')
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

  it('상세를 열고 닫아도 가족 목록 구독으로 변경을 처리한다', async () => {
    const user = { id: 'user-1' } as User
    const view = <ReminderTab user={user} familyId="fam-1" isInitializing={false} />
    mockListParam = 'list-1'
    const { rerender } = render(view)

    const [topic, refresh] = mockUseRealtimeSync.mock.calls[0] as [string, () => void]
    expect(topic).toBe('family_lists_fam-1')
    await act(async () => { refresh() })
    expect(screen.getByTestId('detail-refresh-version')).toHaveTextContent('1')
    await userEvent.click(screen.getByRole('button', { name: 'save-detail-group' }))
    expect(mockBroadcast).toHaveBeenCalledTimes(1)

    mockListParam = null
    mockGetReminderListsWithPreviews.mockClear()
    await act(async () => {
      rerender(<ReminderTab user={user} familyId="fam-1" isInitializing={false} />)
    })
    expect(screen.queryByText('detail:list-1')).not.toBeInTheDocument()
    expect(mockGetReminderListsWithPreviews).not.toHaveBeenCalled()
    mockGetReminderListsWithPreviews.mockClear()
    await act(async () => { refresh() })
    expect(mockGetReminderListsWithPreviews).toHaveBeenCalledWith('fam-1')
  })

  it.each([false, true])('상세에서 넘겨받은 조회는 최신 목록 응답을 존중한다 (%s)', async (familyReadSucceeds) => {
    const item = {
      id: 'item-1', list_id: 'list-1', created_by: 'user-1', name: '상세 조회 항목', is_checked: false,
      checked_by: null, checked_at: null, sort_order: 0, created_at: '2026-01-01T00:00:00Z',
    }
    const list = {
      id: 'list-1', family_id: 'fam-1', created_by: 'user-1', name: '장보기',
      reminder_group_id: null, type: 'strikethrough', sort_order: 0, created_at: item.created_at,
      previewItems: [],
    }
    mockGetReminderListsWithPreviews.mockResolvedValueOnce([list])
    let finishPreview!: (items: ReminderItem[]) => void
    mockPendingPreview = new Promise(resolve => { finishPreview = resolve })
    mockListParam = 'list-1'
    const user = { id: 'user-1' } as User
    const { rerender } = render(<ReminderTab user={user} familyId="fam-1" isInitializing={false} />)
    await screen.findByText('장보기')
    await userEvent.click(screen.getByRole('button', { name: 'close-detail' }))
    mockListParam = null
    rerender(<ReminderTab user={user} familyId="fam-1" isInitializing={false} />)

    const refresh = mockUseRealtimeSync.mock.calls[0][1] as () => void
    if (familyReadSucceeds) {
      mockGetReminderListsWithPreviews.mockResolvedValueOnce([
        { ...list, previewItems: [{ ...item, name: '최신 목록 조회 항목' }] },
      ])
    } else {
      mockGetReminderListsWithPreviews.mockRejectedValueOnce(new Error('temporary failure'))
    }
    await act(async () => { refresh() })
    await act(async () => { finishPreview([item]) })

    expect(screen.getByText(familyReadSucceeds ? '최신 목록 조회 항목' : '상세 조회 항목')).toBeInTheDocument()
    expect(screen.queryByText(familyReadSucceeds ? '상세 조회 항목' : '목록을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('상세에서 이미 반영한 미리보기를 이전 가족 목록 응답으로 덮어쓰지 않는다', async () => {
    const list = {
      id: 'list-1', family_id: 'fam-1', created_by: 'user-1', name: '장보기',
      reminder_group_id: null, type: 'strikethrough', sort_order: 0,
      created_at: '2026-01-01T00:00:00Z', previewItems: [],
    }
    mockPreviewItems = [{
      id: 'item-1', list_id: 'list-1', created_by: 'user-1', name: '새 항목', is_checked: false,
      checked_by: null, checked_at: null, sort_order: 0, created_at: list.created_at,
    }]
    mockGetReminderListsWithPreviews.mockResolvedValueOnce([list])
    let finishOlderRead!: (lists: Array<typeof list>) => void
    mockGetReminderListsWithPreviews.mockReturnValueOnce(new Promise(resolve => { finishOlderRead = resolve }))
    mockListParam = 'list-1'
    const user = { id: 'user-1' } as User
    const { rerender } = render(<ReminderTab user={user} familyId="fam-1" isInitializing={false} />)
    await screen.findByText('장보기')

    const refresh = mockUseRealtimeSync.mock.calls[0][1] as () => void
    act(() => { refresh() })
    await userEvent.click(screen.getByRole('button', { name: 'publish-preview' }))
    await userEvent.click(screen.getByRole('button', { name: 'close-detail' }))
    mockListParam = null
    rerender(<ReminderTab user={user} familyId="fam-1" isInitializing={false} />)
    await act(async () => { finishOlderRead([list]) })
    expect(screen.getByText('새 항목')).toBeInTheDocument()
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

it('keeps a successful initial read after a newer read fails', async () => {
  jest.clearAllMocks()
  clearReminderTabCache()
  mockListParam = null
  const list = {
    id: 'list-1', family_id: 'fam-1', created_by: 'tester', name: 'Groceries',
    reminder_group_id: null, type: 'strikethrough', sort_order: 0,
    created_at: '2026-01-01T00:00:00Z', previewItems: [],
  }
  let finishInitial!: (lists: Array<typeof list>) => void
  mockGetReminderListsWithPreviews
    .mockReturnValueOnce(new Promise(resolve => { finishInitial = resolve }))
    .mockRejectedValueOnce(new Error('temporary error'))
  mockGetReminderGroups.mockResolvedValue([])
  mockGetFamilyMembers.mockResolvedValue([])
  render(<ReminderTab user={{ id: 'tester' } as User} familyId="fam-1" isInitializing={false} />)
  const refresh = mockUseRealtimeSync.mock.calls[0][1] as () => void
  await act(async () => { refresh() })
  await act(async () => { finishInitial([list]) })
  expect(screen.queryByText('Groceries')).toBeInTheDocument()
})
