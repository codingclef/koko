import { render, screen } from '@testing-library/react'
import { TimeWheelPicker } from '@/components/calendar/TimeWheelPicker'

describe('TimeWheelPicker', () => {
  it('시 콜론 분 구분자가 렌더링된다', () => {
    render(<TimeWheelPicker hours={9} minutes={30} onChange={jest.fn()} />)
    expect(screen.getByText(':')).toBeInTheDocument()
  })

  it('00-23 시간 값이 모두 렌더링된다', () => {
    render(<TimeWheelPicker hours={9} minutes={0} onChange={jest.fn()} />)
    expect(screen.getAllByText('00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('23').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('09').length).toBeGreaterThanOrEqual(1)
  })

  it('00-59 분 값이 모두 렌더링된다', () => {
    render(<TimeWheelPicker hours={0} minutes={30} onChange={jest.fn()} />)
    expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('59').length).toBeGreaterThanOrEqual(1)
  })

  it('선택 영역 배경이 선택된 시간 텍스트를 덮지 않도록 레이어를 분리한다', () => {
    render(<TimeWheelPicker hours={9} minutes={30} onChange={jest.fn()} />)

    const [selectedHour] = screen.getAllByRole('option', { selected: true })
    const highlight = selectedHour.parentElement?.previousElementSibling

    expect(highlight).toHaveClass('z-0')
    expect(selectedHour).toHaveClass('relative', 'z-10')
  })
})
