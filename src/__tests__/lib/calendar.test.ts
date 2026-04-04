import {
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getCalendarMembers,
  getCalendarMembersForCalendars,
  setCalendarMembers,
  getFamilyMembers,
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
  ;['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'gte', 'lte', 'order'].forEach((m) => {
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
  it('생성된 캘린더를 반환한다 (owner 먼저, members 따로)', async () => {
    const mockCal = { id: 'cal-1', name: '가족', color: '#f97316' }
    mockFrom
      .mockReturnValueOnce(makeChain({ data: mockCal, error: null }))  // calendars insert
      .mockReturnValueOnce(makeChain({ data: null, error: null }))      // calendar_members: owner
      .mockReturnValueOnce(makeChain({ data: null, error: null }))      // calendar_members: members
    const result = await createCalendar('fam-1', 'user-1', '가족', '#f97316', ['user-2'])
    expect(result).toEqual(mockCal)
    expect(mockFrom).toHaveBeenCalledWith('calendars')
    expect(mockFrom).toHaveBeenCalledWith('calendar_members')
    // owner + members = calendar_members 2회 호출
    expect(mockFrom.mock.calls.filter(([t]) => t === 'calendar_members')).toHaveLength(2)
  })

  it('memberUserIds 없이도 동작한다 (owner만 등록, members insert 생략)', async () => {
    const mockCal = { id: 'cal-1', name: '가족', color: '#f97316' }
    mockFrom
      .mockReturnValueOnce(makeChain({ data: mockCal, error: null }))  // calendars insert
      .mockReturnValueOnce(makeChain({ data: null, error: null }))      // calendar_members: owner only
    const result = await createCalendar('fam-1', 'user-1', '가족', '#f97316')
    expect(result).toEqual(mockCal)
    // owner만 = calendar_members 1회 호출
    expect(mockFrom.mock.calls.filter(([t]) => t === 'calendar_members')).toHaveLength(1)
  })

  it('calendars insert error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'insert error' } }))
    await expect(createCalendar('fam-1', 'user-1', '가족', '#f97316')).rejects.toEqual({ message: 'insert error' })
  })

  it('owner insert error가 있으면 throw한다', async () => {
    const mockCal = { id: 'cal-1', name: '가족', color: '#f97316' }
    mockFrom
      .mockReturnValueOnce(makeChain({ data: mockCal, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'owner insert error' } }))
    await expect(createCalendar('fam-1', 'user-1', '가족', '#f97316')).rejects.toEqual({ message: 'owner insert error' })
  })
})

// ── getCalendarMembers ────────────────────────────────────

describe('getCalendarMembers', () => {
  it('캘린더 멤버 목록을 반환한다', async () => {
    const mockData = [{ calendar_id: 'cal-1', user_id: 'user-1', role: 'owner' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getCalendarMembers('cal-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('calendar_members')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getCalendarMembers('cal-1')).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getCalendarMembers('cal-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

// ── getCalendarMembersForCalendars ────────────────────────

describe('getCalendarMembersForCalendars', () => {
  it('빈 배열이면 쿼리 없이 빈 배열을 반환한다', async () => {
    const result = await getCalendarMembersForCalendars([])
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('여러 캘린더 멤버를 반환한다', async () => {
    const mockData = [
      { calendar_id: 'cal-1', user_id: 'user-1', role: 'owner' },
      { calendar_id: 'cal-2', user_id: 'user-2', role: 'member' },
    ]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getCalendarMembersForCalendars(['cal-1', 'cal-2'])
    expect(result).toEqual(mockData)
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getCalendarMembersForCalendars(['cal-1'])).rejects.toEqual({ message: 'fetch error' })
  })
})

// ── setCalendarMembers ────────────────────────────────────

describe('setCalendarMembers', () => {
  it('owner 제외 기존 멤버 삭제 후 새 멤버를 등록한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await setCalendarMembers('cal-1', 'owner-1', ['user-2', 'user-3'])
    expect(mockFrom).toHaveBeenCalledWith('calendar_members')
  })

  it('새 멤버가 없으면 삭제만 한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await setCalendarMembers('cal-1', 'owner-1', [])
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('삭제 시 error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(setCalendarMembers('cal-1', 'owner-1', ['user-2'])).rejects.toEqual({ message: 'delete error' })
  })
})

// ── getFamilyMembers ──────────────────────────────────────

describe('getFamilyMembers', () => {
  it('가족 구성원 목록을 반환한다', async () => {
    const mockData = [{ id: 'fm-1', family_id: 'fam-1', user_id: 'user-1', display_name: '홍길동' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getFamilyMembers('fam-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('family_members')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getFamilyMembers('fam-1')).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getFamilyMembers('fam-1')).rejects.toEqual({ message: 'fetch error' })
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
