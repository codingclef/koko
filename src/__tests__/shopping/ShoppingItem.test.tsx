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
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} onRename={jest.fn()} />)
    expect(screen.getByText('우유')).toBeInTheDocument()
  })

  it('체크 버튼 클릭 시 onCheck가 호출된다', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('체크'))
    expect(onCheck).toHaveBeenCalledWith('item-1', true)
  })

  it('체크된 아이템은 취소선이 표시된다 (strikethrough 방식)', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    const checkedItem = { ...mockItem, is_checked: true }
    render(<ShoppingItem item={checkedItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} onRename={jest.fn()} />)
    expect(screen.getByText('우유')).toHaveClass('line-through')
  })

  it('삭제 버튼 클릭 시 onDelete가 호출된다', () => {
    const onCheck = jest.fn()
    const onDelete = jest.fn()
    render(<ShoppingItem item={mockItem} listType="strikethrough" onCheck={onCheck} onDelete={onDelete} onRename={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(onDelete).toHaveBeenCalledWith('item-1')
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
})
