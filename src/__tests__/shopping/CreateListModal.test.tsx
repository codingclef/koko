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
    const onCreate = jest.fn().mockResolvedValue(true)
    render(<CreateListModal onClose={jest.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByPlaceholderText('예: 이마트, 코스트코'), {
      target: { value: '이마트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('이마트', 'strikethrough', null)
    })
  })

  it('그룹 선택 후 생성하면 선택한 그룹 id를 전달한다', async () => {
    const onCreate = jest.fn().mockResolvedValue(true)
    render(
      <CreateListModal
        groups={[
          {
            id: 'group-1',
            family_id: 'fam-1',
            created_by: 'user-1',
            name: '집',
            color: '#3b82f6',
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]}
        onClose={jest.fn()}
        onCreate={onCreate}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('예: 이마트, 코스트코'), {
      target: { value: '이마트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '집' }))
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('이마트', 'strikethrough', 'group-1')
    })
  })

  it('X 버튼 클릭 시 onClose가 호출된다', () => {
    const onClose = jest.fn()
    render(<CreateListModal onClose={onClose} onCreate={jest.fn()} />)
    // backdrop click to close
    fireEvent.click(document.querySelector('.absolute.inset-0')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('onCreate 실패 시 로딩 상태가 복구되고 다시 제출 가능하다', async () => {
    const onCreate = jest.fn().mockResolvedValueOnce(false)
    render(<CreateListModal onClose={jest.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByPlaceholderText('예: 이마트, 코스트코'), {
      target: { value: '이마트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '만들기' })).not.toBeDisabled()
      expect(screen.getByPlaceholderText('예: 이마트, 코스트코')).toHaveValue('이마트')
    })
  })
})
