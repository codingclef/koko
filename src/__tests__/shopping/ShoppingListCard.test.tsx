import { render, screen, fireEvent } from '@testing-library/react'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import type { ShoppingList } from '@/lib/shopping'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

const mockList: ShoppingList = {
  id: 'list-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  name: '이마트',
  type: 'strikethrough',
  created_at: '2026-01-01T00:00:00Z',
}

describe('ShoppingListCard', () => {
  it('삭제 버튼 클릭 시 확인 UI가 나타난다', () => {
    const onDelete = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('삭제'))

    expect(screen.getByText('삭제할까요?')).toBeInTheDocument()
    expect(screen.getByLabelText('삭제 확인')).toBeInTheDocument()
    expect(screen.getByLabelText('취소')).toBeInTheDocument()
  })

  it('확인 클릭 시 onDelete가 호출된다', () => {
    const onDelete = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('삭제 확인'))

    expect(onDelete).toHaveBeenCalledWith('list-1')
  })

  it('취소 클릭 시 onDelete가 호출되지 않고 확인 UI가 사라진다', () => {
    const onDelete = jest.fn()
    render(<ShoppingListCard list={mockList} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('삭제'))
    fireEvent.click(screen.getByLabelText('취소'))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('삭제할까요?')).not.toBeInTheDocument()
  })

  it('목록 이름이 렌더링된다', () => {
    render(<ShoppingListCard list={mockList} onDelete={jest.fn()} />)
    expect(screen.getByText('이마트')).toBeInTheDocument()
  })
})
