import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddItemInput } from '@/components/reminders/AddItemInput'

describe('AddItemInput', () => {
  it('입력창과 추가 버튼이 렌더링된다', () => {
    render(<AddItemInput onAdd={jest.fn()} />)
    expect(screen.getByPlaceholderText('아이템 추가...')).toBeInTheDocument()
    expect(screen.getByLabelText('추가')).toBeInTheDocument()
  })

  it('입력창은 text-base 클래스를 가진다 (iOS Safari zoom 방지)', () => {
    render(<AddItemInput onAdd={jest.fn()} />)
    const input = screen.getByPlaceholderText('아이템 추가...')
    expect(input).toHaveClass('text-base')
    expect(input).not.toHaveClass('text-sm')
  })

  it('빈 값으로는 onAdd가 호출되지 않는다', async () => {
    const onAdd = jest.fn()
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByLabelText('추가'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('값 입력 후 제출하면 onAdd가 호출되고 입력창이 초기화된다', async () => {
    const onAdd = jest.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<AddItemInput onAdd={onAdd} />)

    const input = screen.getByPlaceholderText('아이템 추가...')
    await user.type(input, '우유')
    await user.click(screen.getByLabelText('추가'))

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('우유')
      expect(input).toHaveValue('')
      expect(input).toHaveFocus()
    })
  })

  it('onAdd 실패 시 입력값을 유지하고 다시 제출 가능하다', async () => {
    const onAdd = jest.fn().mockResolvedValueOnce(false)
    const user = userEvent.setup()
    render(<AddItemInput onAdd={onAdd} />)

    await user.type(screen.getByPlaceholderText('아이템 추가...'), '우유')
    await user.click(screen.getByLabelText('추가'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('아이템 추가...')).toHaveValue('우유')
      expect(screen.getByLabelText('추가')).not.toBeDisabled()
    })
  })

  it('inline 입력창이 비어 있는 상태로 blur되면 취소 콜백을 호출한다', async () => {
    const onCancelEmpty = jest.fn()
    const user = userEvent.setup()
    render(<AddItemInput onAdd={jest.fn()} onCancelEmpty={onCancelEmpty} inline />)

    const input = screen.getByPlaceholderText('아이템 추가...')
    await user.click(input)
    await user.tab()

    expect(onCancelEmpty).toHaveBeenCalledTimes(1)
  })

  it('inline 입력창에 값이 있으면 blur되어도 취소하지 않는다', async () => {
    const onCancelEmpty = jest.fn()
    const user = userEvent.setup()
    render(<AddItemInput onAdd={jest.fn()} onCancelEmpty={onCancelEmpty} inline />)

    const input = screen.getByPlaceholderText('아이템 추가...')
    await user.type(input, '우유')
    await user.tab()

    expect(onCancelEmpty).not.toHaveBeenCalled()
  })

  it('일반 입력창도 비어 있는 상태로 blur되면 취소 콜백을 호출한다', async () => {
    const onCancelEmpty = jest.fn()
    const user = userEvent.setup()
    render(
      <div>
        <AddItemInput onAdd={jest.fn()} onCancelEmpty={onCancelEmpty} />
        <button type="button">바깥</button>
      </div>
    )

    const input = screen.getByPlaceholderText('아이템 추가...')
    await user.click(input)
    await user.click(screen.getByText('바깥'))

    expect(onCancelEmpty).toHaveBeenCalledTimes(1)
  })
})
