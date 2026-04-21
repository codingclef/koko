import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { ShoppingTab, clearShoppingTabCache } from '@/components/tabs/ShoppingTab'

const mockCreateShoppingList = jest.fn()
const mockGetShoppingListsWithPreviews = jest.fn()
const mockDeleteShoppingList = jest.fn()
const mockRenameShoppingList = jest.fn()
const mockReorderShoppingLists = jest.fn()
const mockBroadcast = jest.fn()
const mockUseRealtimeSync = jest.fn((_c: unknown, _r: unknown, _o: unknown) => mockBroadcast)
const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockListParam: string | null = null
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

jest.mock('@/lib/shopping', () => ({
  getShoppingListsWithPreviews: (...args: unknown[]) => mockGetShoppingListsWithPreviews(...args),
  createShoppingList: (...args: unknown[]) => mockCreateShoppingList(...args),
  deleteShoppingList: (...args: unknown[]) => mockDeleteShoppingList(...args),
  renameShoppingList: (...args: unknown[]) => mockRenameShoppingList(...args),
  reorderShoppingLists: (...args: unknown[]) => mockReorderShoppingLists(...args),
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
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  TouchSensor: class {},
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}))

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: jest.fn((items: unknown[]) => items),
  rectSortingStrategy: {},
}))

jest.mock('@/components/shopping/ShoppingListCard', () => ({
  ShoppingListCard: ({
    list,
    onOpen,
  }: {
    list: { id: string; name: string }
    onOpen: (listId: string) => void
  }) => <button onClick={() => onOpen(list.id)}>{list.name}</button>,
}))

jest.mock('@/components/shopping/ShoppingDetailView', () => ({
  ShoppingDetailView: ({
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

describe('ShoppingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearShoppingTabCache()
    mockListParam = null
    mockGetShoppingListsWithPreviews.mockResolvedValue([])
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('refreshOnSubscribed: false를 전달하지 않는다', async () => {
    render(
      <ShoppingTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )
    await act(async () => {})
    const calls = mockUseRealtimeSync.mock.calls as unknown as Array<[unknown, unknown, { refreshOnSubscribed?: boolean } | undefined]>
    const options = calls[0]?.[2]
    expect(options?.refreshOnSubscribed).not.toBe(false)
  })

  it('상단 여백을 다른 탭과 같은 압축 기준으로 사용한다', async () => {
    render(
      <ShoppingTab user={{ id: 'user-1' } as User} familyId="fam-1" isInitializing={false} />
    )
    await act(async () => {})
    const container = screen.getByTestId('shopping-tab-container')
    expect(container.className).toContain('pt-2')
    expect(container.className).not.toContain('py-8')
  })

  it('목록 생성 실패 시 optimistic 항목을 롤백하고 에러를 표시한다', async () => {
    const user = userEvent.setup()
    mockCreateShoppingList.mockRejectedValueOnce(new Error('insert failed'))
    const mockUser = { id: 'user-1' } as User

    render(
      <ShoppingTab
        user={mockUser}
        familyId="fam-1"
        isInitializing={false}
      />
    )

    await user.click(await screen.findByLabelText('새 장바구니 추가'))
    await user.type(screen.getByPlaceholderText('예: 이마트, 코스트코'), '이마트')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(screen.getByText('목록을 저장하지 못했어요')).toBeInTheDocument()
    })

    expect(screen.queryByText('이마트')).not.toBeInTheDocument()
  })

  it('familyId가 바뀌면 이전 가족의 캐시 목록을 보여주지 않는다', async () => {
    const mockUser = { id: 'user-1' } as User
    mockGetShoppingListsWithPreviews
      .mockResolvedValueOnce([
        {
          id: 'list-1',
          family_id: 'fam-1',
          created_by: 'user-1',
          name: '첫째 가족 목록',
          type: 'strikethrough',
          sort_order: 0,
          created_at: '2026-01-01T00:00:00Z',
          previewItems: [],
        },
      ])
      .mockRejectedValueOnce(new Error('fetch failed'))

    const { rerender } = render(
      <ShoppingTab user={mockUser} familyId="fam-1" isInitializing={false} />
    )

    expect(await screen.findByText('첫째 가족 목록')).toBeInTheDocument()

    rerender(<ShoppingTab user={mockUser} familyId="fam-2" isInitializing={false} />)

    await waitFor(() => {
      expect(screen.getByText('목록을 불러오지 못했어요')).toBeInTheDocument()
    })

    expect(screen.queryByText('첫째 가족 목록')).not.toBeInTheDocument()
  })

  it('목록 카드 열기 시 canonical shopping detail URL로 push한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User

    mockGetShoppingListsWithPreviews.mockResolvedValueOnce([
      {
        id: 'list-1',
        family_id: 'fam-1',
        created_by: 'user-1',
        name: '이마트',
        type: 'strikethrough',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        previewItems: [],
      },
    ])

    render(<ShoppingTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    await user.click(await screen.findByRole('button', { name: '이마트' }))

    expect(mockPush).toHaveBeenCalledWith('/calendar?tab=shopping&list=list-1', { scroll: false })
  })

  it('list 쿼리가 있으면 상세를 열고 닫기 시 shopping 리스트 URL로 replace한다', async () => {
    const user = userEvent.setup()
    const mockUser = { id: 'user-1' } as User
    mockListParam = 'list-1'

    render(<ShoppingTab user={mockUser} familyId="fam-1" isInitializing={false} />)

    expect(await screen.findByText('detail:list-1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close-detail' }))

    expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=shopping', { scroll: false })
  })
})
