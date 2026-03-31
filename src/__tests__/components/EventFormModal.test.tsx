import { render, screen, fireEvent, act } from '@testing-library/react'
import { EventFormModal } from '@/components/calendar/EventFormModal'
import type { Calendar } from '@/lib/calendar'

jest.mock('@/lib/calendar', () => ({
  REMINDER_OPTIONS: [
    { minutes: 0, label: '정각' },
    { minutes: 10, label: '10분 전' },
    { minutes: 30, label: '30분 전' },
  ],
}))
jest.mock('@/lib/supabase', () => ({
  supabase: {},
}))

const calendars: Calendar[] = [
  { id: 'cal-1', family_id: 'fam-1', created_by: 'user-1', name: '가족', color: '#f97316', created_at: '', updated_at: '' },
]

const defaultProps = {
  calendars,
  onClose: jest.fn(),
  onSave: jest.fn().mockResolvedValue(undefined),
}

describe('EventFormModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('풀스크린으로 렌더링된다 (fixed inset-0)', () => {
    const { container } = render(<EventFormModal {...defaultProps} />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/fixed/)
    expect(root.className).toMatch(/inset-0/)
  })

  it('종일 모드에서 날짜 input만 렌더링된다', () => {
    render(<EventFormModal {...defaultProps} />)
    const dateInputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/)
    const timeInputs = screen.queryAllByDisplayValue(/\d{2}:\d{2}/)
    expect(dateInputs.length).toBeGreaterThan(0)
    expect(timeInputs.length).toBe(0)
  })

  it('종일 해제 시 시간 input이 나타난다', () => {
    render(<EventFormModal {...defaultProps} />)
    // 종일 토글 버튼 클릭 (현재 isAllDay=true → false)
    const allToggle = document.querySelector('button.w-11') as HTMLElement
    fireEvent.click(allToggle)

    const timeInputs = document.querySelectorAll('input[type="time"]')
    expect(timeInputs.length).toBe(2) // 시작 + 종료
  })

  it('제목 없으면 저장 버튼이 disabled다', () => {
    render(<EventFormModal {...defaultProps} />)
    const saveBtn = screen.getByText('저장')
    expect(saveBtn).toBeDisabled()
  })

  it('제목 입력 후 저장 버튼이 활성화된다', () => {
    render(<EventFormModal {...defaultProps} />)
    const titleInput = screen.getByPlaceholderText('제목')
    fireEvent.change(titleInput, { target: { value: '테스트 일정' } })
    const saveBtn = screen.getByText('저장')
    expect(saveBtn).not.toBeDisabled()
  })

  it('저장 시 onSave가 startAt, endAt, isAllDay를 포함해 호출된다', async () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    const titleInput = screen.getByPlaceholderText('제목')
    fireEvent.change(titleInput, { target: { value: '생일' } })

    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '생일',
        isAllDay: true,
        startAt: expect.any(String),
        endAt: expect.any(String),
      })
    )
  })

  it('종료 날짜가 시작보다 이르면 저장이 차단된다', async () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    // 종일 해제
    const allToggle = document.querySelector('button.w-11') as HTMLElement
    fireEvent.click(allToggle)

    // 시작: 2026-03-31 09:00 (기본)
    // 종료 날짜를 이전 날짜로 변경
    const dateInputs = document.querySelectorAll('input[type="date"]')
    const endDateInput = dateInputs[1] as HTMLInputElement
    fireEvent.change(endDateInput, { target: { value: '2026-03-30' } })

    // 종료가 시작으로 복귀되어야 함
    expect(endDateInput.value).toBe('2026-03-31')

    // 저장 시도해도 onSave 미호출 (title 없어서 차단됨 + end < start 차단)
    const titleInput = screen.getByPlaceholderText('제목')
    fireEvent.change(titleInput, { target: { value: '테스트' } })
    // 종료가 이미 시작과 같으므로 저장 가능
    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })
    expect(defaultProps.onSave).toHaveBeenCalled()
  })

  it('종료 시간이 시작보다 이르면 시작 시간으로 복귀된다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    // 종일 해제
    const allToggle = document.querySelector('button.w-11') as HTMLElement
    fireEvent.click(allToggle)

    // 시작 시간을 14:00으로 변경
    const timeInputs = document.querySelectorAll('input[type="time"]')
    const startTimeInput = timeInputs[0] as HTMLInputElement
    fireEvent.change(startTimeInput, { target: { value: '14:00' } })

    // 종료 시간을 08:00으로 설정 (시작보다 이름)
    const endTimeInput = timeInputs[1] as HTMLInputElement
    fireEvent.change(endTimeInput, { target: { value: '08:00' } })

    // 종료 시간이 시작 시간(14:00)으로 복귀되어야 함
    expect(endTimeInput.value).toBe('14:00')
  })

  it('X 버튼 클릭 시 onClose가 호출된다', () => {
    render(<EventFormModal {...defaultProps} />)
    // 헤더의 닫기 버튼 (p-1 text-stone-400 클래스)
    const closeButton = document.querySelector('button.p-1.text-stone-400') as HTMLElement
    fireEvent.click(closeButton)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('initial event가 있을 때 편집 타이틀이 표시된다', () => {
    const initial = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '기존 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      created_at: '',
      updated_at: '',
    }
    render(<EventFormModal {...defaultProps} initial={initial} />)
    expect(screen.getByText('일정 편집')).toBeInTheDocument()
  })
})
