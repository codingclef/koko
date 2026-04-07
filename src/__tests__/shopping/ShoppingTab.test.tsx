import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import { ShoppingTab } from '@/components/tabs/ShoppingTab'

const mockCreateShoppingList = jest.fn()
const mockGetShoppingListsWithPreviews = jest.fn()
const mockDeleteShoppingList = jest.fn()
const mockRenameShoppingList = jest.fn()
const mockReorderShoppingLists = jest.fn()
const mockBroadcast = jest.fn()

jest.mock('@/lib/shopping', () => ({
  getShoppingListsWithPreviews: (...args: unknown[]) => mockGetShoppingListsWithPreviews(...args),
  createShoppingList: (...args: unknown[]) => mockCreateShoppingList(...args),
  deleteShoppingList: (...args: unknown[]) => mockDeleteShoppingList(...args),
  renameShoppingList: (...args: unknown[]) => mockRenameShoppingList(...args),
  reorderShoppingLists: (...args: unknown[]) => mockReorderShoppingLists(...args),
}))

jest.mock('@/hooks/useRealtimeSync', () => ({
  useRealtimeSync: () => mockBroadcast,
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
  ShoppingListCard: ({ list }: { list: { name: string } }) => <div>{list.name}</div>,
}))

describe('ShoppingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetShoppingListsWithPreviews.mockResolvedValue([])
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
})
