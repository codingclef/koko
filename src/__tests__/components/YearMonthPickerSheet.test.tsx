import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { YearMonthPickerSheet } from '@/components/calendar/YearMonthPickerSheet'

function renderPicker(overrides?: {
  year?: number
  month?: number
  onConfirm?: jest.Mock
  onClose?: jest.Mock
}) {
  const anchorRef = createRef<HTMLButtonElement>()
  const onConfirm = overrides?.onConfirm ?? jest.fn()
  const onClose = overrides?.onClose ?? jest.fn()

  render(
    <YearMonthPickerSheet
      year={overrides?.year ?? 2026}
      month={overrides?.month ?? 3}
      anchorRef={anchorRef}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )

  return { onConfirm, onClose }
}

describe('YearMonthPickerSheet', () => {
  it('연도 컬럼과 월 컬럼이 렌더링된다', () => {
    renderPicker({ year: 2026, month: 3 })

    expect(screen.getByText('2026년')).toBeInTheDocument()
    expect(screen.getByText('4월')).toBeInTheDocument()
  })

  it('현재 표시 year 기준 ±10 범위의 연도가 렌더링된다', () => {
    renderPicker({ year: 2026 })

    expect(screen.getByText('2016년')).toBeInTheDocument()
    expect(screen.getByText('2036년')).toBeInTheDocument()
  })

  it('1월~12월이 모두 렌더링된다', () => {
    renderPicker()

    for (let m = 1; m <= 12; m++) {
      expect(screen.getByText(`${m}월`)).toBeInTheDocument()
    }
  })

  it('확인 버튼 클릭 시 onConfirm이 호출된다', () => {
    const onConfirm = jest.fn()
    renderPicker({ year: 2026, month: 3, onConfirm })

    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect(onConfirm).toHaveBeenCalledWith(2026, 3)
  })

  it('취소 버튼 클릭 시 onClose가 호출되고 onConfirm은 호출되지 않는다', () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()
    renderPicker({ onConfirm, onClose })

    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('오버레이(패널 외부) 클릭 시 onClose가 호출된다', () => {
    const onClose = jest.fn()
    const { container } = render(
      <YearMonthPickerSheet
        year={2026}
        month={3}
        anchorRef={createRef<HTMLButtonElement>()}
        onConfirm={jest.fn()}
        onClose={onClose}
      />
    )

    // 오버레이(루트 div) 직접 클릭
    fireEvent.click(container.firstChild as HTMLElement)

    expect(onClose).toHaveBeenCalled()
  })

  it('패널 내부 클릭 시 onClose가 호출되지 않는다', () => {
    const onClose = jest.fn()
    renderPicker({ onClose })

    // 패널 내부의 확인 버튼 클릭 — 오버레이 닫힘이 발생하면 안 됨
    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    // onClose는 취소 버튼으로만 호출됨
    expect(onClose).not.toHaveBeenCalled()
  })
})
