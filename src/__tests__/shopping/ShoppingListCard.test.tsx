import { render, screen, fireEvent } from '@testing-library/react'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import type { ShoppingList, ItemPreview } from '@/lib/shopping'

const mockOnOpen = jest.fn()

jest.mock('@dnd-kit/sortable', () => ({
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

const mockList: ShoppingList = {
  id: 'list-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  name: '이마트',
  reminder_group_id: null,
  type: 'strikethrough',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

const mockPreviewItems: ItemPreview[] = [
  { id: 'item-1', name: '우유', is_checked: false, sort_order: 0 },
  { id: 'item-2', name: '계란', is_checked: true, sort_order: 1 },
  { id: 'item-3', name: '식빵', is_checked: false, sort_order: 2 },
  { id: 'item-4', name: '버터', is_checked: false, sort_order: 3 },
]

describe('ShoppingListCard', () => {
  beforeEach(() => {
    mockOnOpen.mockClear()
  })

  it('삭제 버튼 클릭 시 다이얼로그가 나타난다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)

    fireEvent.click(screen.getByLabelText('삭제'))

    expect(screen.getByText('리마인더 삭제')).toBeInTheDocument()
    expect(screen.getByLabelText('삭제 확인')).toBeInTheDocument()
    expect(screen.getByLabelText('취소')).toBeInTheDocument()
  })

  it('다이얼로그에서 삭제 클릭 시 onDelete가 호출된다', () => {
    const onDelete = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={onDelete} onRename={jest.fn()} onOpen={mockOnOpen} />)

    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('삭제 확인'))

    expect(onDelete).toHaveBeenCalledWith('list-1')
  })

  it('다이얼로그에서 취소 클릭 시 onDelete가 호출되지 않고 다이얼로그가 닫힌다', () => {
    const onDelete = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={onDelete} onRename={jest.fn()} onOpen={mockOnOpen} />)

    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('취소'))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('리마인더 삭제')).not.toBeInTheDocument()
  })

  it('목록 이름이 렌더링된다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    expect(screen.getByText('이마트')).toBeInTheDocument()
  })

  it('그룹이 있으면 그룹 이름을 표시한다', () => {
    render(
      <ShoppingListCard
        list={mockList}
        group={{
          id: 'group-1',
          family_id: 'fam-1',
          created_by: 'user-1',
          name: '집',
          color: '#3b82f6',
          sort_order: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onOpen={mockOnOpen}
      />
    )

    expect(screen.getByText('집')).toBeInTheDocument()
  })

  it('이름 클릭 시 인라인 편집 입력창이 나타난다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByText('이마트'))
    expect(screen.getByLabelText('목록 이름 수정')).toBeInTheDocument()
  })

  it('이름 수정 후 Enter 키로 onRename이 호출된다', () => {
    const onRename = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={onRename} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByText('이마트'))
    const input = screen.getByLabelText('목록 이름 수정')
    fireEvent.change(input, { target: { value: '코스트코' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('list-1', '코스트코')
  })

  it('Escape 키 입력 시 편집이 취소된다', () => {
    const onRename = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={onRename} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByText('이마트'))
    const input = screen.getByLabelText('목록 이름 수정')
    fireEvent.change(input, { target: { value: '코스트코' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('이마트')).toBeInTheDocument()
  })

  it('previewItems가 없으면 빈 상태 텍스트가 렌더링된다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    expect(screen.getByText('아이템 없음')).toBeInTheDocument()
    expect(screen.queryByText('우유')).not.toBeInTheDocument()
  })

  it('previewItems 3개까지 렌더링된다', () => {
    render(
      <ShoppingListCard
        list={mockList}
        previewItems={mockPreviewItems}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onOpen={mockOnOpen}
      />
    )
    expect(screen.getByText('우유')).toBeInTheDocument()
    expect(screen.getByText('계란')).toBeInTheDocument()
    expect(screen.getByText('식빵')).toBeInTheDocument()
    expect(screen.queryByText('버터')).not.toBeInTheDocument()
    expect(screen.getByText('+1개 더')).toBeInTheDocument()
  })

  it('3개 이하의 previewItems는 더보기 텍스트가 없다', () => {
    render(
      <ShoppingListCard
        list={mockList}
        previewItems={mockPreviewItems.slice(0, 2)}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onOpen={mockOnOpen}
      />
    )
    expect(screen.getByText('우유')).toBeInTheDocument()
    expect(screen.getByText('계란')).toBeInTheDocument()
    expect(screen.queryByText(/개 더/)).not.toBeInTheDocument()
  })

  it('카드 본문이 키보드로 접근 가능하다 (tabIndex=0)', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    const cardBody = screen.getByLabelText('이마트 리마인더 열기')
    expect(cardBody).toHaveAttribute('tabindex', '0')
  })

  it('카드 본문에서 Enter 키 입력 시 onOpen이 호출된다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    const cardBody = screen.getByLabelText('이마트 리마인더 열기')
    fireEvent.keyDown(cardBody, { key: 'Enter' })
    expect(mockOnOpen).toHaveBeenCalledWith('list-1')
  })

  it('삭제 버튼 클릭 시 카드 네비게이션이 발생하지 않는다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(mockOnOpen).not.toHaveBeenCalled()
  })

  it('이름 영역 클릭 시 카드 네비게이션이 발생하지 않는다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByText('이마트'))
    expect(mockOnOpen).not.toHaveBeenCalled()
  })

  it('이름에서 Enter 키 입력 시 인라인 편집 입력창이 나타난다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    const nameBtn = screen.getByRole('button', { name: '이마트' })
    fireEvent.keyDown(nameBtn, { key: 'Enter' })
    expect(screen.getByLabelText('목록 이름 수정')).toBeInTheDocument()
  })

  it('삭제 모달이 role="dialog"와 aria-modal 속성을 가진다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('모달에서 Escape 키 입력 시 모달이 닫힌다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('편집 모드 input은 text-base 클래스를 가진다 (iOS Safari zoom 방지)', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} onRename={jest.fn()} onOpen={mockOnOpen} />)
    fireEvent.click(screen.getByText('이마트'))
    const input = screen.getByLabelText('목록 이름 수정')
    expect(input).toHaveClass('text-base')
    expect(input).not.toHaveClass('text-sm')
  })
})
