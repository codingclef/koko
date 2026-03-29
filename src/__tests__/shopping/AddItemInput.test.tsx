import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddItemInput } from '@/components/shopping/AddItemInput'

describe('AddItemInput', () => {
  it('입력창과 추가 버튼이 렌더링된다', () => {
    render(<AddItemInput onAdd={jest.fn()} />)
    expect(screen.getByPlaceholderText('아이템 추가...')).toBeInTheDocument()
    expect(screen.getByLabelText('추가')).toBeInTheDocument()
  })

  it('빈 값으로는 onAdd가 호출되지 않는다', async () => {
    const onAdd = jest.fn()
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByLabelText('추가'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('값 입력 후 제출하면 onAdd가 호출되고 입력창이 초기화된다', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AddItemInput onAdd={onAdd} />)

    await user.type(screen.getByPlaceholderText('아이템 추가...'), '우유')
    await user.click(screen.getByLabelText('추가'))

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('우유')
      expect(screen.getByPlaceholderText('아이템 추가...')).toHaveValue('')
    })
  })
})
