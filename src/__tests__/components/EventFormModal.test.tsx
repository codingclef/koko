import { render, screen, fireEvent, act, createEvent } from '@testing-library/react'
import { EventFormModal } from '@/components/calendar/EventFormModal'
import type { Calendar } from '@/lib/calendar'

jest.mock('@/lib/calendar', () => ({
  REMINDER_OPTIONS: [
    { minutes: 0, label: '정각' },
    { minutes: 10, label: '10분 전' },
    { minutes: 30, label: '30분 전' },
  ],
  LABEL_COLORS: ['#f97316', '#3b82f6', '#10b981'],
  LABEL_COLOR_NAMES: {
    '#f97316': '주황색',
    '#3b82f6': '파란색',
    '#10b981': '에메랄드',
  },
}))
jest.mock('@/lib/supabase', () => ({
  supabase: {},
}))
jest.mock('@/components/calendar/TimeWheelPicker', () => ({
  TimeWheelPicker: ({
    hours,
    minutes,
    onChange,
  }: {
    hours: number
    minutes: number
    onChange: (h: number, m: number) => void
  }) => (
    <div data-testid="time-wheel-picker">
      <input
        data-testid="wheel-hours"
        type="number"
        value={hours}
        onChange={(e) => onChange(parseInt(e.target.value), minutes)}
      />
      <input
        data-testid="wheel-minutes"
        type="number"
        value={minutes}
        onChange={(e) => onChange(hours, parseInt(e.target.value))}
      />
    </div>
  ),
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

  it('시트 컨테이너에 safe-area 상단 패딩을 적용한다', () => {
    const { container } = render(<EventFormModal {...defaultProps} />)
    const sheet = container.querySelector('.h-dvh') as HTMLElement
    expect(sheet).toHaveStyle({ paddingTop: 'env(safe-area-inset-top, 0px)' })
  })

  it('데스크톱에서는 시트가 더 넓고 높게 렌더링된다', () => {
    const { container } = render(<EventFormModal {...defaultProps} />)
    const sheet = container.querySelector('.h-dvh') as HTMLElement

    expect(sheet).toHaveClass('sm:h-[min(960px,calc(100dvh-24px))]')
    expect(sheet).toHaveClass('sm:w-[min(1200px,calc(100vw-32px))]')
  })

  it('종일 모드에서 날짜 input만 렌더링된다', () => {
    render(<EventFormModal {...defaultProps} />)
    const dateInputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/)
    expect(dateInputs.length).toBeGreaterThan(0)
    // 시간 wheel picker는 종일 모드에서 없어야 함
    expect(screen.queryByTestId('time-wheel-picker')).not.toBeInTheDocument()
  })

  it('종일 해제 시 시간 버튼이 나타난다', () => {
    render(<EventFormModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '종일' }))

    // 시간 버튼(HH:MM 형태)이 나타나야 함
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
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

  it('레퍼런스 레이아웃 순서로 주요 항목을 표시한다', () => {
    render(<EventFormModal {...defaultProps} />)

    const orderedNodes = [
      screen.getByPlaceholderText('제목'),
      screen.getByText('가족'),
      screen.getByText('종일'),
      screen.getByText('시작'),
      screen.getByText('종료'),
      screen.getByText('라벨'),
      screen.getByText('알람'),
      screen.getByPlaceholderText('메모 (선택)'),
      screen.getByText('반복'),
    ]

    orderedNodes.slice(1).forEach((node, index) => {
      expect(
        orderedNodes[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
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
        localStartDate: '2026-03-31',
        localEndDate: '2026-03-31',
      })
    )
  })

  it('종료 날짜가 시작보다 이르면 저장이 차단된다', async () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    // 종일 해제
    fireEvent.click(screen.getByRole('button', { name: '종일' }))

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

  it('시작 날짜가 종료 날짜보다 뒤로 바뀌면 종료 날짜를 시작 날짜로 보정한다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    const dateInputs = document.querySelectorAll('input[type="date"]')
    const startDateInput = dateInputs[0] as HTMLInputElement
    const endDateInput = dateInputs[1] as HTMLInputElement

    fireEvent.change(startDateInput, { target: { value: '2026-04-02' } })

    expect(startDateInput.value).toBe('2026-04-02')
    expect(endDateInput.value).toBe('2026-04-02')
  })

  it('종료 시간이 시작보다 이르면 시작 시간으로 복귀된다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    // 종일 해제
    fireEvent.click(screen.getByRole('button', { name: '종일' }))

    // 종료 시간 picker 열기
    fireEvent.click(screen.getByText('10:00'))

    // 종료 시간을 08:00으로 설정 (시작 09:00보다 이름)
    const hoursInput = screen.getByTestId('wheel-hours') as HTMLInputElement
    fireEvent.change(hoursInput, { target: { value: '8' } })

    // 종료 시간이 시작 시간(09:00)으로 복귀 → wheel hours 값이 9가 되어야 함
    expect(hoursInput.value).toBe('9')
  })

  it('시작 시간이 종료 시간보다 뒤로 바뀌면 종료 시간을 시작 시간으로 보정한다', async () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    fireEvent.click(screen.getByRole('button', { name: '종일' }))
    fireEvent.click(screen.getByText('09:00'))

    const hoursInput = screen.getByTestId('wheel-hours') as HTMLInputElement
    fireEvent.change(hoursInput, { target: { value: '11' } })

    expect(screen.getAllByText('11:00')).toHaveLength(2)

    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '시간 일정' } })
    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: expect.any(String),
        endAt: expect.any(String),
      })
    )
    const savedParams = defaultProps.onSave.mock.calls[0][0]
    expect(savedParams.endAt).toBe(savedParams.startAt)
  })

  it('X 버튼 클릭 시 애니메이션 후 onClose가 호출된다', () => {
    render(<EventFormModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('initial event가 있을 때 편집 타이틀이 표시된다', () => {
    const initial: import('@/lib/calendar').CalendarEvent = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '기존 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      is_cancelled: false,
      label_color: null,
      series_id: null,
      series_occurrence_date: null,
      created_at: '',
      updated_at: '',
    }
    render(<EventFormModal {...defaultProps} initial={initial} />)
    expect(screen.getByDisplayValue('기존 일정')).toBeInTheDocument()
  })

  it('날짜 버튼에 요일이 표시된다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    // 2026-03-31은 화요일
    expect(screen.getAllByText(/2026년 3월 31일 \(화\)/).length).toBeGreaterThan(0)
  })

  it('날짜 input은 보이는 날짜 버튼 영역 안에서 직접 클릭을 받는다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    const dateInputs = document.querySelectorAll('input[type="date"]')

    expect(screen.getByTestId('start-date-button')).toContainElement(dateInputs[0] as HTMLElement)
    expect(screen.getByTestId('end-date-button')).toContainElement(dateInputs[1] as HTMLElement)
    expect(dateInputs[0]).toHaveClass('absolute')
    expect(dateInputs[0]).toHaveClass('inset-0')
    expect(dateInputs[0]).toHaveClass('cursor-pointer')
    expect(dateInputs[1]).toHaveClass('cursor-pointer')
  })

  it('종일 모드 날짜 버튼은 absolute input의 기준점이 되도록 relative class를 유지한다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    expect(screen.getByTestId('start-date-button')).toHaveClass('relative')
    expect(screen.getByTestId('end-date-button')).toHaveClass('relative')
  })

  it('날짜 input은 키보드와 보조기기 접근성을 위해 focus 가능하게 유지한다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    const dateInputs = document.querySelectorAll('input[type="date"]')

    expect(dateInputs[0]).not.toHaveClass('pointer-events-none')
    expect(dateInputs[1]).not.toHaveClass('pointer-events-none')
    expect(dateInputs[0]).not.toHaveAttribute('tabindex', '-1')
    expect(dateInputs[1]).not.toHaveAttribute('tabindex', '-1')
    expect(dateInputs[0]).toHaveAccessibleName(/시작 날짜/)
    expect(dateInputs[1]).toHaveAccessibleName(/종료 날짜/)
  })

  it('보이는 날짜 버튼 클릭 시 데스크톱 날짜 picker를 연다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    const dateInputs = document.querySelectorAll('input[type="date"]')
    const startShowPicker = jest.fn()
    const endShowPicker = jest.fn()
    Object.defineProperty(dateInputs[0], 'showPicker', { value: startShowPicker, configurable: true })
    Object.defineProperty(dateInputs[1], 'showPicker', { value: endShowPicker, configurable: true })

    fireEvent.click(screen.getByTestId('start-date-button'))
    fireEvent.click(screen.getByTestId('end-date-button'))

    expect(startShowPicker).toHaveBeenCalledTimes(1)
    expect(endShowPicker).toHaveBeenCalledTimes(1)
  })

  it('모바일 기본 제목 크기를 컴팩트하게 유지한다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    expect(screen.getByPlaceholderText('제목')).toHaveClass('text-[1.625rem]')
    expect(screen.getByPlaceholderText('제목')).toHaveClass('sm:text-[2rem]')
  })

  it('메모 입력창은 iOS 확대를 막기 위해 모바일에서도 text-base를 유지한다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)

    expect(screen.getByPlaceholderText('메모 (선택)')).toHaveClass('text-base')
    expect(screen.getByPlaceholderText('메모 (선택)')).not.toHaveClass('text-sm')
  })

  it('showPicker()가 없는 브라우저에서는 native 날짜 input 기본 동작을 막지 않는다', () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-03-31')} />)
    const dateInputs = document.querySelectorAll('input[type="date"]')
    // showPicker 메서드가 없는 환경 시뮬레이션
    Object.defineProperty(dateInputs[0], 'showPicker', { value: undefined, configurable: true })
    Object.defineProperty(dateInputs[1], 'showPicker', { value: undefined, configurable: true })

    const startClick = createEvent.click(screen.getByTestId('start-date-button'))
    const endClick = createEvent.click(screen.getByTestId('end-date-button'))
    const startPreventDefault = jest.spyOn(startClick, 'preventDefault')
    const endPreventDefault = jest.spyOn(endClick, 'preventDefault')

    fireEvent(screen.getByTestId('start-date-button'), startClick)
    fireEvent(screen.getByTestId('end-date-button'), endClick)

    expect(startPreventDefault).not.toHaveBeenCalled()
    expect(endPreventDefault).not.toHaveBeenCalled()
  })

  it('시간 버튼 클릭 시 wheel picker가 나타난다', () => {
    render(<EventFormModal {...defaultProps} />)
    // 종일 해제
    fireEvent.click(screen.getByRole('button', { name: '종일' }))

    expect(screen.queryByTestId('time-wheel-picker')).not.toBeInTheDocument()

    // 시작 시간 버튼 클릭
    fireEvent.click(screen.getByText('09:00'))
    expect(screen.getByTestId('time-wheel-picker')).toBeInTheDocument()

    // 다시 클릭하면 닫힘
    fireEvent.click(screen.getByText('09:00'))
    expect(screen.queryByTestId('time-wheel-picker')).not.toBeInTheDocument()
  })

  it('반복 일정 following 편집에서는 시작 날짜만 anchor 이후로 수정할 수 있다', async () => {
    const initial = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '반복 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      is_cancelled: false,
      label_color: null,
      series_id: 'series-1',
      series_occurrence_date: '2026-03-31',
      created_at: '',
      updated_at: '',
    }

    render(<EventFormModal {...defaultProps} initial={initial} recurrenceScope="following" />)

    const dateInputs = document.querySelectorAll('input[type="date"]')
    expect((dateInputs[0] as HTMLInputElement).disabled).toBe(false)
    expect((dateInputs[0] as HTMLInputElement).min).toBe('2026-03-31')
    expect((dateInputs[1] as HTMLInputElement).disabled).toBe(true)

    fireEvent.change(dateInputs[0] as HTMLInputElement, { target: { value: '2026-04-01' } })
    expect((dateInputs[1] as HTMLInputElement).value).toBe('2026-04-01')
    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '반복 일정 수정' } })

    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        localStartDate: '2026-04-01',
        localEndDate: '2026-04-01',
      })
    )
  })

  it('반복 일정 following 편집에서 anchor 이전 시작 날짜 저장을 막는다', async () => {
    const initial = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '반복 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      is_cancelled: false,
      label_color: null,
      series_id: 'series-1',
      series_occurrence_date: '2026-03-31',
      created_at: '',
      updated_at: '',
    }

    render(<EventFormModal {...defaultProps} initial={initial} recurrenceScope="following" />)

    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0] as HTMLInputElement, { target: { value: '2026-03-30' } })
    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '반복 일정 수정' } })

    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).not.toHaveBeenCalled()
    expect(screen.getByText('이후 일정은 선택한 일정 날짜 이후로만 이동할 수 있어요.')).toBeInTheDocument()
  })

  it('반복 일정 전체 편집에서는 날짜 input이 비활성화된다', () => {
    const initial = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '반복 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      is_cancelled: false,
      label_color: null,
      series_id: 'series-1',
      series_occurrence_date: '2026-03-31',
      created_at: '',
      updated_at: '',
    }

    render(<EventFormModal {...defaultProps} initial={initial} recurrenceScope="all" />)

    const dateInputs = document.querySelectorAll('input[type="date"]')
    expect((dateInputs[0] as HTMLInputElement).disabled).toBe(true)
    expect((dateInputs[1] as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('전체 반복 일정은 날짜 이동 없이 시간과 내용만 변경할 수 있어요.')).toBeInTheDocument()
  })

  it('사용자화 반복 간격을 수정해 저장할 수 있다', async () => {
    render(<EventFormModal {...defaultProps} initialDate={new Date('2026-04-17T00:00:00')} />)

    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '반복 회의' } })
    fireEvent.click(screen.getByText('안 함'))
    fireEvent.click(screen.getByText('사용자화'))

    const intervalInput = screen.getByLabelText('반복 간격') as HTMLInputElement
    fireEvent.change(intervalInput, { target: { value: '2' } })

    expect(intervalInput.value).toBe('2')
    expect(screen.getByText('반복 간격')).toBeInTheDocument()
    expect(screen.getByText('2주마다 금요일')).toBeInTheDocument()
    expect(screen.getByText('종료일을 설정하지 않으면 시작일 기준 1년 동안 반복 일정을 생성해요.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('완료'))
    expect(screen.getByText('2주마다 금요일')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '반복 회의',
        recurrence: expect.objectContaining({
          freq: 'weekly',
          interval: 2,
          daysOfWeek: [5],
        }),
      })
    )
  })

  it('following 반복 일정은 기존 반복 규칙을 표시하고 변경된 규칙을 저장한다', async () => {
    const initial: import('@/lib/calendar').CalendarEvent = {
      id: 'evt-1',
      family_id: 'fam-1',
      calendar_id: 'cal-1',
      created_by: 'user-1',
      title: '반복 일정',
      description: null,
      start_at: '2026-03-31T09:00:00.000Z',
      end_at: '2026-03-31T10:00:00.000Z',
      is_all_day: false,
      is_cancelled: false,
      label_color: null,
      series_id: 'series-1',
      series_occurrence_date: '2026-03-31',
      created_at: '',
      updated_at: '',
    }

    render(
      <EventFormModal
        {...defaultProps}
        initial={initial}
        recurrenceScope="following"
        initialRecurrence={{ freq: 'weekly', interval: 1, daysOfWeek: [2] }}
      />
    )

    expect(screen.getByText('매주 화요일')).toBeInTheDocument()

    fireEvent.click(screen.getByText('매주 화요일'))
    expect(screen.queryByText('안 함')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('사용자화'))

    const intervalInput = screen.getByLabelText('반복 간격') as HTMLInputElement
    fireEvent.change(intervalInput, { target: { value: '2' } })
    fireEvent.click(screen.getByText('완료'))

    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '반복 일정 수정' } })
    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })

    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: expect.objectContaining({
          freq: 'weekly',
          interval: 2,
          daysOfWeek: [2],
        }),
      })
    )
  })
})

// ── 라벨 색상 ────────────────────────────────────────────────

describe('라벨 색상', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('기본값이 없으면 "캘린더 색상 사용"으로 표시된다', () => {
    render(<EventFormModal {...defaultProps} />)
    expect(screen.getByText('캘린더 색상 사용')).toBeInTheDocument()
  })

  it('defaultLabelColor가 있으면 색상 이름이 표시된다', () => {
    render(<EventFormModal {...defaultProps} defaultLabelColor="#10b981" />)
    expect(screen.getByText('에메랄드')).toBeInTheDocument()
  })

  it('기존 이벤트의 label_color가 defaultLabelColor보다 우선한다', () => {
    const initial: import('@/lib/calendar').CalendarEvent = {
      id: 'evt-1', family_id: 'fam-1', calendar_id: 'cal-1', created_by: 'user-1',
      title: '테스트', description: null, start_at: '2026-04-18T09:00:00Z',
      end_at: null, is_all_day: false, label_color: '#3b82f6',
      series_id: null, series_occurrence_date: null, is_cancelled: false,
      created_at: '', updated_at: '',
    }
    render(<EventFormModal {...defaultProps} initial={initial} defaultLabelColor="#10b981" />)
    expect(screen.getByText('파란색')).toBeInTheDocument()
  })

  it('기존 이벤트의 label_color가 null이면 defaultLabelColor를 무시하고 null을 유지한다', async () => {
    const initial: import('@/lib/calendar').CalendarEvent = {
      id: 'evt-1', family_id: 'fam-1', calendar_id: 'cal-1', created_by: 'user-1',
      title: '테스트', description: null, start_at: '2026-04-18T00:00:00Z',
      end_at: null, is_all_day: true, label_color: null,
      series_id: null, series_occurrence_date: null, is_cancelled: false,
      created_at: '', updated_at: '',
    }
    render(<EventFormModal {...defaultProps} initial={initial} defaultLabelColor="#f97316" />)
    expect(screen.getByText('캘린더 색상 사용')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('저장')) })
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ labelColor: null })
    )
  })

  it('라벨 색상 버튼 클릭 시 팔레트가 열린다', () => {
    render(<EventFormModal {...defaultProps} />)
    fireEvent.click(screen.getByText('라벨'))
    expect(screen.getByTitle('주황색')).toBeInTheDocument()
  })

  it('저장 시 onSave에 labelColor가 포함된다', async () => {
    render(<EventFormModal {...defaultProps} defaultLabelColor="#f97316" />)
    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '테스트 일정' } })
    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ labelColor: '#f97316' })
    )
  })

  it('null 선택 시 onSave에 labelColor: null이 포함된다', async () => {
    render(<EventFormModal {...defaultProps} defaultLabelColor="#f97316" />)
    // 팔레트 열기
    fireEvent.click(screen.getByText('라벨'))
    // null 선택 (캘린더 색상 사용)
    fireEvent.click(screen.getByTitle('캘린더 색상 사용'))
    fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '테스트' } })
    await act(async () => {
      fireEvent.click(screen.getByText('저장'))
    })
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ labelColor: null })
    )
  })
})
