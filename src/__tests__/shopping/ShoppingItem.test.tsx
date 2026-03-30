import { render, screen, fireEvent } from '@testing-library/react'
import { ShoppingItem } from '@/components/shopping/ShoppingItem'
import type { ShoppingItem as ShoppingItemType } from '@/lib/shopping'

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

const mockItem: ShoppingItemType = {
  id: 'item-1',
  list_id: 'list-1',
  created_by: 'user-1',
  name: '우유',
  is_checked: false,
  checked_by: null,
  checked_at: null,
  sort_order: 0,
  created_at: new Date().toISOString(),
}

describe('ShoppingItem', () => {
  it('아이템 이름을 표시한다', () => {
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} />)
    expect(screen.getByText('우유')).toBeInTheDocument()
  })

  it('체크 버튼 클릭 시 onCheck가 호출된다', () => {
    const onCheck = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={jest.fn()} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('체크'))
    expect(onCheck).toHaveBeenCalledWith('item-1', true)
  })

  it('체크된 아이템은 취소선이 표시된다 (strikethrough 방식)', () => {
    const checkedItem = { ...mockItem, is_checked: true }
    render(<ShoppingItem item={checkedItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} />)
    expect(screen.getByText('우유')).toHaveClass('line-through')
  })

  it('삭제 버튼 클릭 시 확인 다이얼로그가 나타난다', () => {
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(screen.getByText('아이템 삭제')).toBeInTheDocument()
    expect(screen.getByLabelText('삭제 확인')).toBeInTheDocument()
    expect(screen.getByLabelText('취소')).toBeInTheDocument()
  })

  it('다이얼로그에서 삭제 확인 시 onDelete가 호출된다', () => {
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={onDelete} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('삭제 확인'))
    expect(onDelete).toHaveBeenCalledWith('item-1')
  })

  it('다이얼로그에서 취소 시 onDelete가 호출되지 않는다', () => {
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={onDelete} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('취소'))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('아이템 삭제')).not.toBeInTheDocument()
  })

  it('이름 클릭 시 인라인 편집 입력창이 나타난다', () => {
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} />)
    fireEvent.click(screen.getByText('우유'))
    expect(screen.getByLabelText('아이템 이름 수정')).toBeInTheDocument()
  })

  it('이름 수정 후 Enter 키로 onRename이 호출된다', () => {
    const onRename = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={onRename} />)
    fireEvent.click(screen.getByText('우유'))
    const input = screen.getByLabelText('아이템 이름 수정')
    fireEvent.change(input, { target: { value: '두유' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('item-1', '두유')
  })

  it('Escape 키 입력 시 편집이 취소된다', () => {
    const onRename = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={onRename} />)
    fireEvent.click(screen.getByText('우유'))
    const input = screen.getByLabelText('아이템 이름 수정')
    fireEvent.change(input, { target: { value: '두유' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('우유')).toBeInTheDocument()
  })

  it('draggable=true이면 드래그 핸들이 표시된다', () => {
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} draggable />)
    expect(screen.getByLabelText('드래그 핸들')).toBeInTheDocument()
  })

  it('draggable이 없으면 드래그 핸들이 표시되지 않는다', () => {
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={jest.fn()} onDelete={jest.fn()} onRename={jest.fn()} />)
    expect(screen.queryByLabelText('드래그 핸들')).not.toBeInTheDocument()
  })
})
