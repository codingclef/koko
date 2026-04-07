import { render, screen, fireEvent } from '@testing-library/react'
import ShoppingDetailPage from '@/app/shopping/[id]/page'

const mockPush = jest.fn()
const mockBack = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'list-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}))

jest.mock('@/hooks/useRealtimeSync', () => ({
  useRealtimeSync: () => jest.fn(),
}))

jest.mock('@/lib/shopping', () => ({
  getShoppingList: jest.fn().mockResolvedValue({ id: 'list-1', name: '이마트', type: 'strikethrough' }),
  getShoppingItems: jest.fn().mockResolvedValue([]),
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
  arrayMove: jest.fn(),
  verticalListSortingStrategy: {},
}))

describe('ShoppingDetailPage', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockBack.mockClear()
  })

  it('뒤로가기 버튼 클릭 시 router.back()이 호출된다', async () => {
    render(<ShoppingDetailPage />)

    const backButton = await screen.findByLabelText('뒤로가기')
    fireEvent.click(backButton)

    expect(mockBack).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
