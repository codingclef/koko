import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { ShoppingDetailView } from '@/components/shopping/ShoppingDetailView'
import { getShoppingItems, getShoppingList, updateShoppingListGroup } from '@/lib/shopping'

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

jest.mock('@/lib/shopping', () => ({
  getShoppingList: jest.fn(),
  getShoppingItems: jest.fn(),
  addShoppingItem: jest.fn(),
  checkShoppingItem: jest.fn(),
  deleteShoppingItem: jest.fn(),
  renameShoppingItem: jest.fn(),
  reorderShoppingItems: jest.fn(),
  updateShoppingListGroup: jest.fn(),
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

const mockGetShoppingList = getShoppingList as jest.MockedFunction<typeof getShoppingList>
const mockGetShoppingItems = getShoppingItems as jest.MockedFunction<typeof getShoppingItems>
const mockUpdateShoppingListGroup = updateShoppingListGroup as jest.MockedFunction<typeof updateShoppingListGroup>

describe('ShoppingDetailView', () => {
  const mockUser = { id: 'user-1' } as User
  const onClose = jest.fn()
  const onPreviewItemsChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetShoppingList.mockResolvedValue({
      id: 'list-1',
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '이마트',
      reminder_group_id: null,
      type: 'strikethrough',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    } as never)
    mockGetShoppingItems.mockResolvedValue([] as never)
    mockUpdateShoppingListGroup.mockResolvedValue({
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
      <ShoppingDetailView
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
      <ShoppingDetailView
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
    mockGetShoppingList.mockResolvedValueOnce(null)

    render(
      <ShoppingDetailView
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
    mockGetShoppingList.mockRejectedValueOnce(new Error('load failed'))

    render(
      <ShoppingDetailView
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
      <ShoppingDetailView
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
    mockGetShoppingItems.mockResolvedValueOnce([
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
      <ShoppingDetailView
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
      <ShoppingDetailView
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

    expect(mockUpdateShoppingListGroup).toHaveBeenCalledWith('list-1', 'user-1', 'group-1')
    await waitFor(() => {
      expect(onListGroupChange).toHaveBeenCalledWith('list-1', 'group-1')
    })
  })

  it('리마인더 그룹 변경 실패 시 이전 그룹으로 되돌리고 에러를 표시한다', async () => {
    const user = userEvent.setup()
    const onListGroupChange = jest.fn()
    mockUpdateShoppingListGroup.mockRejectedValueOnce(new Error('update failed'))

    render(
      <ShoppingDetailView
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
      <ShoppingDetailView
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

    mockGetShoppingList.mockResolvedValueOnce(null)
    await act(async () => {
      familyRefresh?.()
    })

    expect(await screen.findByText('삭제되었거나 접근할 수 없는 리마인더예요.')).toBeInTheDocument()
    expect(onPreviewItemsChange).toHaveBeenLastCalledWith('list-1', [])
  })

  it('아이템이 많아도 목록만 스크롤되고 추가 입력란은 화면 안에 유지된다', async () => {
    mockGetShoppingItems.mockResolvedValueOnce(
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
      <ShoppingDetailView
        listId="list-1"
        user={mockUser}
        onClose={onClose}
        onPreviewItemsChange={onPreviewItemsChange}
      />
    )

    expect(await screen.findByText('아이템 40')).toBeInTheDocument()
    expect(screen.getByTestId('shopping-detail-overlay')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('shopping-detail-shell')).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col')
    expect(screen.getByTestId('shopping-detail-scroll')).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto')

    const footer = screen.getByTestId('shopping-detail-footer')
    expect(footer).toHaveClass('shrink-0')
    expect(within(footer).getByPlaceholderText('아이템 추가...')).toBeInTheDocument()
  })
})
