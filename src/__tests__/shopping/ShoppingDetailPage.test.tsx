import { render, screen, fireEvent } from '@testing-library/react'
import ShoppingDetailPage from '@/app/shopping/[id]/page'
import { getShoppingItems, getShoppingList } from '@/lib/shopping'

const mockPush = jest.fn()
const mockBack = jest.fn()
let consoleErrorSpy: jest.SpyInstance

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

const mockGetShoppingList = getShoppingList as jest.MockedFunction<typeof getShoppingList>
const mockGetShoppingItems = getShoppingItems as jest.MockedFunction<typeof getShoppingItems>

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
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    mockPush.mockClear()
    mockBack.mockClear()
    mockGetShoppingList.mockResolvedValue({ id: 'list-1', name: '이마트', type: 'strikethrough' } as never)
    mockGetShoppingItems.mockResolvedValue([] as never)
  })

  it('뒤로가기 버튼 클릭 시 router.back()이 호출된다', async () => {
    render(<ShoppingDetailPage />)

    const backButton = await screen.findByLabelText('뒤로가기')
    fireEvent.click(backButton)

    expect(mockBack).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('초기 로드 실패 시 오류 상태와 재시도 버튼을 표시한다', async () => {
    mockGetShoppingList.mockRejectedValueOnce(new Error('load failed'))

    render(<ShoppingDetailPage />)

    expect(await screen.findByText('장바구니를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
  })
})
