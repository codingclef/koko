import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateListModal } from '@/components/shopping/CreateListModal'

describe('CreateListModal', () => {
  it('만들기 버튼이 렌더링된다', () => {
    render(<CreateListModal onClose={jest.fn()} onCreate={jest.fn()} />)
    expect(screen.getByRole('button', { name: '만들기' })).toBeInTheDocument()
  })

  it('이름이 비어있으면 만들기 버튼이 비활성화된다', () => {
    render(<CreateListModal onClose={jest.fn()} onCreate={jest.fn()} />)
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
  })

  it('이름 입력 후 만들기 버튼이 활성화된다', () => {
    render(<CreateListModal onClose={jest.fn()} onCreate={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('예: 이마트, 코스트코'), {
      target: { value: '코스트코' },
    })
    expect(screen.getByRole('button', { name: '만들기' })).not.toBeDisabled()
  })

  it('폼 제출 시 onCreate가 호출된다', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined)
    render(<CreateListModal onClose={jest.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByPlaceholderText('예: 이마트, 코스트코'), {
      target: { value: '이마트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('이마트', 'strikethrough')
    })
  })

  it('X 버튼 클릭 시 onClose가 호출된다', () => {
    const onClose = jest.fn()
    render(<CreateListModal onClose={onClose} onCreate={jest.fn()} />)
    // backdrop click to close
    fireEvent.click(document.querySelector('.absolute.inset-0')!)
    expect(onClose).toHaveBeenCalled()
  })
})
