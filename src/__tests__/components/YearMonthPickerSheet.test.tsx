import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { YearMonthPickerSheet } from '@/components/calendar/YearMonthPickerSheet'
import { WheelPickerColumn } from '@/components/calendar/WheelPickerColumn'

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

    fireEvent.click(container.firstChild as HTMLElement)

    expect(onClose).toHaveBeenCalled()
  })

  it('패널 내부 클릭 시 onClose가 호출되지 않는다', () => {
    const onClose = jest.fn()
    renderPicker({ onClose })

    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape 키 입력 시 onClose가 호출된다', () => {
    const onClose = jest.fn()
    renderPicker({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('열릴 때 연도 컬럼(첫 번째 포커스 대상)이 포커스를 받는다', () => {
    renderPicker()

    const [yearListbox] = screen.getAllByRole('listbox')
    expect(document.activeElement).toBe(yearListbox)
  })

  it('dialog role과 aria-modal이 선언되어 있다', () => {
    renderPicker()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', '연월 선택')
  })
})

describe('WheelPickerColumn — 키보드 방향키 탐색', () => {
  it('ArrowDown 키로 다음 항목이 선택된다', () => {
    const onSelect = jest.fn()
    render(
      <WheelPickerColumn
        values={['2024년', '2025년', '2026년']}
        selected={1}
        onSelect={onSelect}
        label="연도"
      />
    )

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('ArrowUp 키로 이전 항목이 선택된다', () => {
    const onSelect = jest.fn()
    render(
      <WheelPickerColumn
        values={['2024년', '2025년', '2026년']}
        selected={1}
        onSelect={onSelect}
        label="연도"
      />
    )

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' })

    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('첫 번째 항목에서 ArrowUp은 범위를 벗어나지 않는다', () => {
    const onSelect = jest.fn()
    render(
      <WheelPickerColumn
        values={['2024년', '2025년']}
        selected={0}
        onSelect={onSelect}
        label="연도"
      />
    )

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' })

    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('마지막 항목에서 ArrowDown은 범위를 벗어나지 않는다', () => {
    const onSelect = jest.fn()
    render(
      <WheelPickerColumn
        values={['2024년', '2025년']}
        selected={1}
        onSelect={onSelect}
        label="연도"
      />
    )

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('선택된 항목에 aria-selected="true"가 적용된다', () => {
    render(
      <WheelPickerColumn
        values={['2024년', '2025년', '2026년']}
        selected={1}
        onSelect={jest.fn()}
        label="연도"
      />
    )

    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[2]).toHaveAttribute('aria-selected', 'false')
  })
})
