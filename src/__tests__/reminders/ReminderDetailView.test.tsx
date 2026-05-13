import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { ReminderDetailView } from '@/components/reminders/ReminderDetailView'
import {
  addReminderItem,
  checkReminderItem,
  deleteReminderItem,
  getReminderItems,
  getReminderList,
  renameReminderItem,
  reorderReminderItems,
  updateReminderListGroup,
} from '@/lib/reminder-lists'

const mockBroadcast = jest.fn()
const mockUseRealtimeSync = jest.fn((...args: unknown[]) => {
  void args
  return mockBroadcast
})
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

jest.mock('@/hooks/useRealtimeSync', () => ({
  useRealtimeSync: (channelName: unknown, refresh: unknown, options: unknown) =>
    mockUseRealtimeSync(channelName, refresh, options),
}))

jest.mock('@/lib/reminder-lists', () => ({
  getReminderList: jest.fn(),
  getReminderItems: jest.fn(),
  addReminderItem: jest.fn(),
  checkReminderItem: jest.fn(),
  deleteReminderItem: jest.fn(),
  renameReminderItem: jest.fn(),
  reorderReminderItems: jest.fn(),
  updateReminderListGroup: jest.fn(),
}))

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  TouchSensor: class {},
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: jest.fn((items: unknown[]) => items),
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

const mockGetReminderList = getReminderList as jest.MockedFunction<typeof getReminderList>
const mockGetReminderItems = getReminderItems as jest.MockedFunction<typeof getReminderItems>
const mockAddReminderItem = addReminderItem as jest.MockedFunction<typeof addReminderItem>
const mockCheckReminderItem = checkReminderItem as jest.MockedFunction<typeof checkReminderItem>
const mockDeleteReminderItem = deleteReminderItem as jest.MockedFunction<typeof deleteReminderItem>
const mockRenameReminderItem = renameReminderItem as jest.MockedFunction<typeof renameReminderItem>
const mockReorderReminderItems = reorderReminderItems as jest.MockedFunction<typeof reorderReminderItems>
const mockUpdateReminderListGroup = updateReminderListGroup as jest.MockedFunction<typeof updateReminderListGroup>

describe('ReminderDetailView', () => {
  const mockUser = { id: 'user-1' } as User
  const onClose = jest.fn()
  const onPreviewItemsChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetReminderList.mockResolvedValue({
      id: 'list-1',
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '이마트',
      reminder_group_id: null,
      type: 'strikethrough',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    } as never)
    mockGetReminderItems.mockResolvedValue([] as never)
    mockAddReminderItem.mockResolvedValue({
      id: 'created-item',
      list_id: 'list-1',
      created_by: 'user-1',
      name: '새 항목',
      is_checked: false,
      checked_by: null,
      checked_at: null,
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    } as never)
    mockRenameReminderItem.mockResolvedValue(undefined as never)
    mockCheckReminderItem.mockResolvedValue(undefined as never)
    mockDeleteReminderItem.mockResolvedValue(undefined as never)
    mockReorderReminderItems.mockResolvedValue(undefined as never)
    mockUpdateReminderListGroup.mockResolvedValue({
      id: 'list-1',
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '이마트',
      reminder_group_id: 'group-1',
      type: 'strikethrough',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    } as never)
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('refreshOnSubscribed: false를 전달하지 않는다', async () => {
    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )
    await act(async () => {})
    const calls = mockUseRealtimeSync.mock.calls as unknown as Array<[unknown, unknown, { refreshOnSubscribed?: boolean } | undefined]>
    const options = calls[0]?.[2]
    expect(options?.refreshOnSubscribed).not.toBe(false)
  })

  it('정상 로드 시 상세 헤더를 렌더링한다', async () => {
    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(await screen.findByText('이마트')).toBeInTheDocument()
    expect(screen.getByText('아래 입력창에 추가해보세요')).toBeInTheDocument()
  })

  it('목록이 없으면 not found 상태를 보여준다', async () => {
    mockGetReminderList.mockResolvedValueOnce(null)

    render(
      <ReminderDetailView
        listId="missing-list"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(
      await screen.findByText('삭제되었거나 접근할 수 없는 리마인더예요.')
    ).toBeInTheDocument()
    expect(screen.getByText('삭제되었거나 접근할 수 없는 리마인더예요.')).toBeInTheDocument()
  })

  it('로드 실패 시 fetch error 상태와 재시도 버튼을 보여준다', async () => {
    mockGetReminderList.mockRejectedValueOnce(new Error('load failed'))

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(await screen.findByText('잠시 후 다시 시도해주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('닫기 버튼 클릭 시 onClose를 호출한다', async () => {
    const user = userEvent.setup()

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByLabelText('목록으로 돌아가기'))

    expect(onClose).toHaveBeenCalled()
  })

  it('아이템 로드 결과를 preview 동기화에 반영한다', async () => {
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await waitFor(() => {
      expect(onPreviewItemsChange).toHaveBeenCalledWith(
        'list-1',
        expect.arrayContaining([expect.objectContaining({ id: 'item-1', name: '우유' })])
      )
    })
  })

  it('리마인더 그룹을 변경하고 부모 목록 상태에 반영한다', async () => {
    const user = userEvent.setup()
    const onListGroupChange = jest.fn()

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        groups={[
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
        ]}
        onClose={onClose}
        onListGroupChange={onListGroupChange}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.selectOptions(await screen.findByLabelText('그룹'), 'group-1')

    expect(mockUpdateReminderListGroup).toHaveBeenCalledWith('list-1', 'user-1', 'group-1')
    await waitFor(() => {
      expect(onListGroupChange).toHaveBeenCalledWith('list-1', 'group-1')
    })
  })

  it('아이템 이름 수정 후 Enter를 누르면 아이템 바로 아래에 새 입력창을 연다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const firstInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(firstInput)
    await user.type(firstInput, '두유')
    await user.keyboard('{Enter}')

    const inlineAddInput = await screen.findByTestId('inline-add-item-input')
    await waitFor(() => {
      expect(within(inlineAddInput).getByPlaceholderText('아이템 추가...')).toHaveFocus()
    })
    expect(screen.queryByLabelText('아이템 이름 수정')).not.toBeInTheDocument()
    expect(mockRenameReminderItem).toHaveBeenCalledWith('item-1', '두유')
  })

  it('마지막 아이템 이름 수정 후 Enter를 눌러도 아이템 바로 아래에 새 입력창을 연다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const editInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(editInput)
    await user.type(editInput, '두유')
    await user.keyboard('{Enter}')

    const inlineAddInput = await screen.findByTestId('inline-add-item-input')
    await waitFor(() => {
      expect(within(inlineAddInput).getByPlaceholderText('아이템 추가...')).toHaveFocus()
    })
    expect(mockRenameReminderItem).toHaveBeenCalledWith('item-1', '두유')
  })

  it('인라인 입력창에서 추가한 아이템을 편집한 아이템 바로 아래에 저장한다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)
    mockAddReminderItem.mockResolvedValueOnce({
      id: 'item-new',
      list_id: 'list-1',
      created_by: 'user-1',
      name: '버터',
      is_checked: false,
      checked_by: null,
      checked_at: null,
      sort_order: 1,
      created_at: '2026-01-01T00:00:01Z',
    } as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const editInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(editInput)
    await user.type(editInput, '두유')
    await user.keyboard('{Enter}')

    const inlineAddInput = await screen.findByTestId('inline-add-item-input')
    await user.type(within(inlineAddInput).getByPlaceholderText('아이템 추가...'), '버터')
    await user.keyboard('{Enter}')

    expect(mockAddReminderItem).toHaveBeenCalledWith('list-1', 'user-1', '버터', 'item-1')
    expect(mockReorderReminderItems).not.toHaveBeenCalled()
    expect(onPreviewItemsChange).toHaveBeenLastCalledWith(
      'list-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'item-1', sort_order: 0 }),
        expect.objectContaining({ id: 'item-new', name: '버터', sort_order: 1 }),
        expect.objectContaining({ id: 'item-2', sort_order: 2 }),
      ])
    )
  })

  it('인라인 입력 기준 아이템을 삭제하면 인라인 입력창을 닫는다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('inline-add-item-input')).toBeInTheDocument()

    await user.click(screen.getAllByLabelText('삭제')[0])
    await user.click(screen.getByLabelText('삭제 확인'))

    expect(mockDeleteReminderItem).toHaveBeenCalledWith('item-1')
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-item-input')).not.toBeInTheDocument()
    })
  })

  it('인라인 입력 기준 아이템을 완료 처리하면 인라인 입력창을 닫는다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('inline-add-item-input')).toBeInTheDocument()

    await user.click(screen.getByLabelText('체크'))

    expect(mockCheckReminderItem).toHaveBeenCalledWith('item-1', 'user-1', true)
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-item-input')).not.toBeInTheDocument()
    })
  })

  it('빈 인라인 입력창이 포커스를 잃으면 입력창을 닫는다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('inline-add-item-input')).toBeInTheDocument()

    await user.click(screen.getByText('달걀'))

    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-item-input')).not.toBeInTheDocument()
    })
  })

  it('이전 아이템 blur 저장이 늦게 완료되어도 새 편집 세션을 닫지 않는다', async () => {
    const user = userEvent.setup()
    let resolveRename: () => void = () => {}
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)
    mockRenameReminderItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve
        }) as never
    )

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const firstInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(firstInput)
    await user.type(firstInput, '두유')
    await user.click(screen.getByText('달걀'))

    const secondInput = screen.getByLabelText('아이템 이름 수정')
    expect(secondInput).toHaveValue('달걀')

    await act(async () => {
      resolveRename()
    })

    await waitFor(() => {
      const currentInput = screen.getByLabelText('아이템 이름 수정')
      expect(currentInput).toHaveValue('달걀')
      expect(currentInput).toHaveFocus()
    })
  })

  it('이전 아이템 Enter 저장이 늦게 완료되어도 새 편집 세션을 닫지 않는다', async () => {
    const user = userEvent.setup()
    let resolveRename: () => void = () => {}
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)
    mockRenameReminderItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve
        }) as never
    )

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const firstInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(firstInput)
    await user.type(firstInput, '두유')
    await user.keyboard('{Enter}')
    await user.click(screen.getByText('달걀'))

    expect(screen.getByLabelText('아이템 이름 수정')).toHaveValue('달걀')

    await act(async () => {
      resolveRename()
    })

    await waitFor(() => {
      const currentInput = screen.getByLabelText('아이템 이름 수정')
      expect(currentInput).toHaveValue('달걀')
      expect(currentInput).toHaveFocus()
    })
    expect(screen.queryByTestId('inline-add-item-input')).not.toBeInTheDocument()
  })

  it('아이템 이름 저장 실패 시 다음 입력으로 이동하지 않고 현재 편집을 유지한다', async () => {
    const user = userEvent.setup()
    mockGetReminderItems.mockResolvedValueOnce([
      {
        id: 'item-1',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '우유',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'item-2',
        list_id: 'list-1',
        created_by: 'user-1',
        name: '달걀',
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as never)
    mockRenameReminderItem.mockRejectedValueOnce(new Error('rename failed'))

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    await user.click(await screen.findByText('우유'))
    const firstInput = screen.getByLabelText('아이템 이름 수정')
    await user.clear(firstInput)
    await user.type(firstInput, '두유')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('아이템 이름을 저장하지 못했어요')).toBeInTheDocument()
    expect(screen.getByLabelText('아이템 이름 수정')).toHaveValue('두유')
    expect(screen.getByLabelText('아이템 이름 수정')).toHaveFocus()
  })

  it('리마인더 그룹 변경 실패 시 이전 그룹으로 되돌리고 에러를 표시한다', async () => {
    const user = userEvent.setup()
    const onListGroupChange = jest.fn()
    mockUpdateReminderListGroup.mockRejectedValueOnce(new Error('update failed'))

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        groups={[
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
        ]}
        onClose={onClose}
        onListGroupChange={onListGroupChange}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    const select = await screen.findByLabelText('그룹')
    await user.selectOptions(select, 'group-1')

    expect(await screen.findByText('그룹을 변경하지 못했어요')).toBeInTheDocument()
    expect(select).toHaveValue('')
    expect(onListGroupChange).toHaveBeenLastCalledWith('list-1', null)
  })

  it('가족 목록 refresh에서 접근할 수 없으면 not found 상태로 전환하고 preview를 비운다', async () => {
    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(await screen.findByText('이마트')).toBeInTheDocument()

    const calls = mockUseRealtimeSync.mock.calls as unknown as Array<[unknown, () => void, unknown]>
    const familyRefresh = calls.find(([channelName]) => channelName === 'family_lists_fam-1')?.[1]
    expect(familyRefresh).toBeDefined()

    mockGetReminderList.mockResolvedValueOnce(null)
    await act(async () => {
      familyRefresh?.()
    })

    expect(await screen.findByText('삭제되었거나 접근할 수 없는 리마인더예요.')).toBeInTheDocument()
    expect(onPreviewItemsChange).toHaveBeenLastCalledWith('list-1', [])
  })

  it('아이템이 많아도 목록만 스크롤되고 추가 입력란은 화면 안에 유지된다', async () => {
    mockGetReminderItems.mockResolvedValueOnce(
      Array.from({ length: 40 }, (_, index) => ({
        id: `item-${index + 1}`,
        list_id: 'list-1',
        created_by: 'user-1',
        name: `아이템 ${index + 1}`,
        is_checked: false,
        checked_by: null,
        checked_at: null,
        sort_order: index,
        created_at: '2026-01-01T00:00:00Z',
      })) as never
    )

    render(
      <ReminderDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(await screen.findByText('아이템 40')).toBeInTheDocument()
    expect(screen.getByTestId('reminder-detail-overlay')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('reminder-detail-shell')).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col')
    expect(screen.getByTestId('reminder-detail-scroll')).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto')

    const footer = screen.getByTestId('reminder-detail-footer')
    expect(footer).toHaveClass('shrink-0')
    expect(within(footer).getByPlaceholderText('아이템 추가...')).toBeInTheDocument()
  })
})
