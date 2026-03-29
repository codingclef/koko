import { render, screen, fireEvent } from '@testing-library/react'
import { ShoppingItem } from '@/components/shopping/ShoppingItem'
import type { ShoppingItem as ShoppingItemType } from '@/lib/shopping'

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
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} />)
    expect(screen.getByText('우유')).toBeInTheDocument()
  })

  it('체크 버튼 클릭 시 onCheck가 호출된다', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('체크'))
    expect(onCheck).toHaveBeenCalledWith('item-1', true)
  })

  it('체크된 아이템은 취소선이 표시된다 (strikethrough 방식)', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    const checkedItem = { ...mockItem, is_checked: true }
    render(<ShoppingItem item={checkedItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} />)
    expect(screen.getByText('우유')).toHaveClass('line-through')
  })

  it('삭제 버튼 클릭 시 onDelete가 호출된다', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(onDelete).toHaveBeenCalledWith('item-1')
  })
})
