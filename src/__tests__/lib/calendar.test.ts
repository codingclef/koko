import {
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getEventsByMonth,
  createEvent,
  updateEvent,
  deleteEvent,
  getReminders,
  setReminders,
} from '@/lib/calendar'

function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'update', 'delete', 'eq', 'gte', 'lte', 'order'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  ;(chain as { finally: unknown }).finally = p.finally.bind(p)
  return chain
}

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
})

// ── getCalendars ──────────────────────────────────────────

describe('getCalendars', () => {
  it('캘린더 목록을 반환한다', async () => {
    const mockData = [{ id: 'cal-1', name: '가족', color: '#f97316' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getCalendars('fam-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('calendars')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getCalendars('fam-1')).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    await expect(getCalendars('fam-1')).rejects.toEqual({ message: 'DB error' })
  })
})

// ── createCalendar ────────────────────────────────────────

describe('createCalendar', () => {
  it('생성된 캘린더를 반환한다', async () => {
    const mockCal = { id: 'cal-1', name: '가족', color: '#f97316' }
    mockFrom.mockReturnValue(makeChain({ data: mockCal, error: null }))
    const result = await createCalendar('fam-1', 'user-1', '가족', '#f97316')
    expect(result).toEqual(mockCal)
    expect(mockFrom).toHaveBeenCalledWith('calendars')
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'insert error' } }))
    await expect(createCalendar('fam-1', 'user-1', '가족', '#f97316')).rejects.toEqual({ message: 'insert error' })
  })
})

// ── updateCalendar ────────────────────────────────────────

describe('updateCalendar', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(updateCalendar('cal-1', { name: '새이름' })).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(updateCalendar('cal-1', { name: '새이름' })).rejects.toEqual({ message: 'update error' })
  })
})

// ── deleteCalendar ────────────────────────────────────────

describe('deleteCalendar', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteCalendar('cal-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteCalendar('cal-1')).rejects.toEqual({ message: 'delete error' })
  })
})

// ── getEventsByMonth ──────────────────────────────────────

describe('getEventsByMonth', () => {
  it('이벤트 목록을 반환한다', async () => {
    const mockData = [{ id: 'evt-1', title: '생일', start_at: '2026-03-15T00:00:00Z' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getEventsByMonth('fam-1', 2026, 2)
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('events')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getEventsByMonth('fam-1', 2026, 2)).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getEventsByMonth('fam-1', 2026, 2)).rejects.toEqual({ message: 'fetch error' })
  })
})

// ── createEvent ───────────────────────────────────────────

describe('createEvent', () => {
  it('생성된 이벤트를 반환한다', async () => {
    const mockEvt = { id: 'evt-1', title: '생일' }
    mockFrom.mockReturnValue(makeChain({ data: mockEvt, error: null }))
    const result = await createEvent({
      familyId: 'fam-1',
      userId: 'user-1',
      calendarId: 'cal-1',
      title: '생일',
      description: null,
      startAt: '2026-03-15T00:00:00Z',
      endAt: null,
      isAllDay: true,
    })
    expect(result).toEqual(mockEvt)
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'insert error' } }))
    await expect(createEvent({
      familyId: 'fam-1', userId: 'user-1', calendarId: null,
      title: '생일', description: null,
      startAt: '2026-03-15T00:00:00Z', endAt: null, isAllDay: true,
    })).rejects.toEqual({ message: 'insert error' })
  })
})

// ── updateEvent ───────────────────────────────────────────

describe('updateEvent', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(updateEvent('evt-1', { title: '새제목' })).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(updateEvent('evt-1', { title: '새제목' })).rejects.toEqual({ message: 'update error' })
  })
})

// ── deleteEvent ───────────────────────────────────────────

describe('deleteEvent', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteEvent('evt-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteEvent('evt-1')).rejects.toEqual({ message: 'delete error' })
  })
})

// ── getReminders ──────────────────────────────────────────

describe('getReminders', () => {
  it('알림 목록을 반환한다', async () => {
    const mockData = [{ id: 'rem-1', event_id: 'evt-1', remind_minutes_before: 30 }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminders('evt-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('event_reminders')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getReminders('evt-1')).toEqual([])
  })
})

// ── setReminders ──────────────────────────────────────────

describe('setReminders', () => {
  it('기존 알림을 삭제하고 새로 등록한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await setReminders('evt-1', [30, 60])
    expect(mockFrom).toHaveBeenCalledWith('event_reminders')
  })

  it('빈 배열이면 삭제만 한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await setReminders('evt-1', [])
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('삭제 시 error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(setReminders('evt-1', [30])).rejects.toEqual({ message: 'delete error' })
  })
})
