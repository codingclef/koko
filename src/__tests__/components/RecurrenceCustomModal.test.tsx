import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { RecurrenceCustomModal } from '@/components/calendar/RecurrenceCustomModal'

const defaultProps = {
  initial: { freq: 'weekly' as const, interval: 1, daysOfWeek: [6], endDate: '2026-08-22' },
  startDate: '2026-05-22',
  onSave: jest.fn(),
  onBack: jest.fn(),
}

describe('RecurrenceCustomModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('보이는 종료일 행 클릭 시 데스크톱 날짜 picker를 연다', () => {
    render(<RecurrenceCustomModal {...defaultProps} />)

    const endDateInput = screen.getByLabelText('반복 종료일') as HTMLInputElement
    const showPicker = jest.fn()
    Object.defineProperty(endDateInput, 'showPicker', { value: showPicker, configurable: true })

    fireEvent.click(screen.getByTestId('recurrence-end-date-button'))

    expect(showPicker).toHaveBeenCalledTimes(1)
  })

  it('showPicker()가 없는 브라우저에서는 native 날짜 input 기본 동작을 막지 않는다', () => {
    render(<RecurrenceCustomModal {...defaultProps} />)

    const endDateInput = screen.getByLabelText('반복 종료일') as HTMLInputElement
    Object.defineProperty(endDateInput, 'showPicker', { value: undefined, configurable: true })

    const click = createEvent.click(screen.getByTestId('recurrence-end-date-button'))
    const preventDefault = jest.spyOn(click, 'preventDefault')
    fireEvent(screen.getByTestId('recurrence-end-date-button'), click)

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('반복 종료일은 시작일 이후의 가까운 날짜를 선택할 수 있다', () => {
    render(
      <RecurrenceCustomModal
        {...defaultProps}
        startDate="2026-05-23"
        initial={{ freq: 'weekly', interval: 1, daysOfWeek: [6], endDate: '2026-05-30' }}
      />
    )

    const endDateInput = screen.getByLabelText('반복 종료일') as HTMLInputElement
    expect(endDateInput.min).toBe('2026-05-23')
    expect(endDateInput.value).toBe('2026-05-30')
  })
})
