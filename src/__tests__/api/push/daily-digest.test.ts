/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/cron/daily-digest/route'
import { NextRequest } from 'next/server'

// ── mocks ────────────────────────────────────────────────────

const mockDispatch = jest.fn()
jest.mock('@/lib/push-utils', () => ({
  dispatchPushNotifications: (...args: unknown[]) => mockDispatch(...args),
}))
jest.mock('@/lib/webpush', () => ({
  __esModule: true,
  default: { sendNotification: jest.fn() },
}))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}))

// ── builder helper ───────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown }

function makeBuilder(result: BuilderResult) {
  const builder: Record<string, unknown> = {}
  ;['select', 'eq', 'in', 'is', 'lte', 'gte', 'or', 'insert', 'upsert', 'delete', 'update'].forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder)
  })
  builder['then'] = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  builder['catch'] = (onRejected: (e: unknown) => unknown) =>
    Promise.resolve(result).catch(onRejected)
  return builder
}

/** setupFromSequence에 전달할 error 결과 */
function fail(error: unknown): BuilderResult { return { data: null, error } }

function setupFromSequence(sequence: (BuilderResult | unknown)[]) {
  sequence.forEach((item) => {
    const result: BuilderResult =
      item !== null && typeof item === 'object' && 'data' in (item as object) && 'error' in (item as object)
        ? (item as BuilderResult)
        : { data: item, error: null }
    mockFrom.mockImplementationOnce(() => makeBuilder(result))
  })
}

// ── fixtures ──────────────────────────────────────────────────

const TODAY_KST = (() => {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return nowKST.toISOString().slice(0, 10)
})()

function makeEvent(overrides: Partial<{
  id: string; family_id: string; calendar_id: string | null
  title: string; start_at: string; end_at: string | null; is_all_day: boolean
}> = {}) {
  return {
    id: 'ev-1', family_id: 'fam-1', calendar_id: null,
    title: '테스트 일정',
    start_at: `${TODAY_KST}T10:00:00+09:00`,
    end_at: null, is_all_day: false,
    ...overrides,
  }
}

const SUB = { id: 'sub1', endpoint: 'https://ep', p256dh: 'k', auth: 'a', user_id: 'u1' }

/**
 * 정상 흐름 from() 호출 순서 (병렬 쿼리 반영):
 * 1. push_subscriptions  - distinct user_id
 * 2. daily_digest_log    - 이미 발송 여부
 * --- Promise.all([family_members, calendar_members, push_subscriptions]) ---
 * 3. family_members
 * 4. calendar_members    - [] 이면 events(calendar) 쿼리 스킵됨
 * 5. push_subscriptions  - 기기별 전체
 * --- Promise.all([events_family, events_calendar?]) ---
 * 6. events (family 공용)
 * 7. daily_digest_log    - insert
 */
function setupHappyPath(events: unknown[] = [makeEvent()]) {
  setupFromSequence([
    [{ user_id: 'u1' }],                         // 1
    [],                                           // 2
    [{ user_id: 'u1', family_id: 'fam-1' }],     // 3
    [],                                           // 4 calendar_members → [] → calendar events 스킵
    [SUB],                                        // 5 push_subscriptions full
    events,                                       // 6 events (family)
    [{ user_id: 'u1' }],                          // 7 insert
  ])
}

// ── env setup ─────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  mockDispatch.mockResolvedValue({ sent: 1, removed: 0 })
})

function makeRequest(secret = 'test-secret') {
  return new NextRequest('http://localhost/api/cron/daily-digest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
}

function makeGetRequest(secret = 'test-secret') {
  return new NextRequest('http://localhost/api/cron/daily-digest', {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
  })
}
// ── tests ──────────────────────────────────────────────────────

describe('POST /api/cron/daily-digest', () => {
  it('CRON_SECRET 불일치 시 401을 반환한다', async () => {
    const res = await POST(makeRequest('wrong'))
    expect(res.status).toBe(401)
  })

  it('push 구독이 없으면 sentUsers=0을 반환한다', async () => {
    setupFromSequence([[]])
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).sentUsers).toBe(0)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('push_subscriptions DB 오류 시 500을 반환한다', async () => {
    setupFromSequence([fail({ message: 'connection error', code: '500' })])
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('daily_digest_log 사전조회 DB 오류 시 500을 반환한다', async () => {
    setupFromSequence([
      [{ user_id: 'u1' }],
      fail({ message: 'connection error', code: '500' }),
    ])
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('family_members DB 오류 시 500을 반환한다', async () => {
    setupFromSequence([
      [{ user_id: 'u1' }],
      [],
      fail({ message: 'connection error', code: '500' }), // family_members
      [],                                                  // calendar_members
      [SUB],
    ])
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('events DB 오류 시 500을 반환한다', async () => {
    setupFromSequence([
      [{ user_id: 'u1' }],
      [],
      [{ user_id: 'u1', family_id: 'fam-1' }],
      [],
      [SUB],
      fail({ message: 'connection error', code: '500' }), // events(family)
    ])
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('이벤트가 있으면 push를 발송하고 sentUsers=1을 반환한다', async () => {
    setupHappyPath()
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).sentUsers).toBe(1)
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })

  it('payload에 title, tag, 멘트, 이벤트명이 포함된다', async () => {
    setupHappyPath()
    await POST(makeRequest())
    const payload = JSON.parse(mockDispatch.mock.calls[0][1])
    expect(payload.title).toBe('오늘의 일정')
    expect(payload.tag).toBe('koko-daily-digest')
    expect(payload.body).toContain('오늘 하루도 힘차게 달려보아요!')
    expect(payload.body).toContain('테스트 일정')
  })

  describe('이벤트 없는 날', () => {
    it('push 미발송, log 미기록', async () => {
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [],   // calendar_members
        [SUB],
        [],   // events family - 없음
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockDispatch).not.toHaveBeenCalled()
    })
  })

  describe('캘린더 멤버십', () => {
    it('내가 속하지 않은 캘린더 일정은 digest에 포함되지 않는다', async () => {
      // u1은 cal-mine 소속, cal-other 이벤트는 메모리 필터에서 제거됨
      const calEvent = makeEvent({ calendar_id: 'cal-other' })
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [{ user_id: 'u1', calendar_id: 'cal-mine' }],
        [SUB],
        [],          // events family - 없음
        [calEvent],  // events calendar (cal-mine 기준 쿼리, 메모리 필터가 걸러냄)
      ])
      const res = await POST(makeRequest())
      expect(mockDispatch).not.toHaveBeenCalled()
      expect((await res.json()).sentUsers).toBe(0)
    })
  })

  describe('정렬', () => {
    it('종일 일정이 시간 일정보다 앞에 온다', async () => {
      const timed = makeEvent({ id: 'ev-t', title: '시간 일정', start_at: `${TODAY_KST}T09:00:00+09:00` })
      const allDay = makeEvent({ id: 'ev-a', title: '종일 일정', is_all_day: true, start_at: `${TODAY_KST}T00:00:00+09:00` })
      setupHappyPath([timed, allDay])
      await POST(makeRequest())
      const body = JSON.parse(mockDispatch.mock.calls[0][1]).body as string
      expect(body.indexOf('종일 일정')).toBeLessThan(body.indexOf('시간 일정'))
    })

    it('같은 start_at이면 title asc으로 정렬된다', async () => {
      const same = `${TODAY_KST}T10:00:00+09:00`
      const evB = makeEvent({ id: 'ev-b', title: 'B 일정', start_at: same })
      const evA = makeEvent({ id: 'ev-a', title: 'A 일정', start_at: same })
      setupHappyPath([evB, evA])
      await POST(makeRequest())
      const body = JSON.parse(mockDispatch.mock.calls[0][1]).body as string
      expect(body.indexOf('A 일정')).toBeLessThan(body.indexOf('B 일정'))
    })
  })

  describe('5개 초과', () => {
    it('5개 초과 시 "외 N개 일정이 더 있어요"를 붙인다', async () => {
      const events = Array.from({ length: 7 }, (_, i) =>
        makeEvent({ id: `ev-${i}`, title: `일정${i}`, start_at: `${TODAY_KST}T${String(9 + i).padStart(2, '0')}:00:00+09:00` })
      )
      setupHappyPath(events)
      await POST(makeRequest())
      const body = JSON.parse(mockDispatch.mock.calls[0][1]).body as string
      expect(body).toContain('외 2개 일정이 더 있어요')
      expect(body).not.toContain('일정5')
    })
  })

  describe('end_at null 종일 일정', () => {
    it('end_at=null인 오늘 종일 일정은 포함된다', async () => {
      const ev = makeEvent({ is_all_day: true, end_at: null, start_at: `${TODAY_KST}T00:00:00+09:00` })
      setupHappyPath([ev])
      await POST(makeRequest())
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })

    it('queryTodayEvents .or() 조건에 end_at.is.null 분기가 포함된다', async () => {
      const capturedOrArgs: string[] = []
      // setupHappyPath와 동일한 시퀀스, 단 events(family) builder에서 .or() 인자를 캡처
      const captureOrBuilder = (data: unknown) => {
        const builder = makeBuilder({ data, error: null })
        const origOr = builder['or'] as jest.Mock
        builder['or'] = jest.fn((arg: string) => { capturedOrArgs.push(arg); return origOr(arg) })
        return builder
      }
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: [{ user_id: 'u1' }], error: null }))
        .mockImplementationOnce(() => makeBuilder({ data: [], error: null }))
        .mockImplementationOnce(() => makeBuilder({ data: [{ user_id: 'u1', family_id: 'fam-1' }], error: null }))
        .mockImplementationOnce(() => makeBuilder({ data: [], error: null }))
        .mockImplementationOnce(() => makeBuilder({ data: [SUB], error: null }))
        .mockImplementationOnce(() => captureOrBuilder([makeEvent()])) // events(family)
        .mockImplementationOnce(() => makeBuilder({ data: [{ user_id: 'u1' }], error: null }))
      await POST(makeRequest())
      expect(capturedOrArgs.some((arg) => arg.includes('end_at.is.null,start_at.gte.'))).toBe(true)
    })
  })

  describe('멀티데이 종일 일정', () => {
    it('어제 시작해 오늘 이어지는 종일 일정은 포함된다', async () => {
      const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000).toISOString().slice(0, 10)
      const ev = makeEvent({
        is_all_day: true,
        start_at: `${yesterday}T00:00:00+09:00`,
        end_at: `${TODAY_KST}T23:59:59+09:00`,
      })
      setupHappyPath([ev])
      await POST(makeRequest())
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })
  })

  describe('중복 발송 방지', () => {
    it('사전 조회에서 이미 발송된 user는 skip한다', async () => {
      setupFromSequence([
        [{ user_id: 'u1' }],   // push_subscriptions
        [{ user_id: 'u1' }],   // daily_digest_log - 이미 발송됨
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('upsert ON CONFLICT 충돌 시 push를 보내지 않는다', async () => {
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [],
        [SUB],
        [makeEvent()],
        [], // upsert 충돌 → 빈 배열
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockDispatch).not.toHaveBeenCalled()
      expect((await res.json()).skippedUsers).toBeGreaterThan(0)
    })

    it('upsert 실제 DB 오류 시 error를 인식하고 skip한다', async () => {
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [],
        [SUB],
        [makeEvent()],
        fail({ message: 'db error', code: '500' }), // upsert 실패
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockDispatch).not.toHaveBeenCalled()
      expect((await res.json()).skippedUsers).toBeGreaterThan(0)
    })
  })

  describe('전송 실패 시 log 삭제 (재시도 허용)', () => {
    it('sent=0이면 log를 삭제한다', async () => {
      mockDispatch.mockResolvedValue({ sent: 0, removed: 1 })
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [],
        [SUB],
        [makeEvent()],
        [{ user_id: 'u1' }], // insert 성공
        null,                 // 8 delete
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockFrom).toHaveBeenCalledTimes(8)
    })

    it('예외 발생 시 log를 삭제한다', async () => {
      mockDispatch.mockRejectedValue(new Error('network error'))
      setupFromSequence([
        [{ user_id: 'u1' }],
        [],
        [{ user_id: 'u1', family_id: 'fam-1' }],
        [],
        [SUB],
        [makeEvent()],
        [{ user_id: 'u1' }], // insert 성공
        null,                 // 8 delete
      ])
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockFrom).toHaveBeenCalledTimes(8)
    })
  })
})

describe('GET /api/cron/daily-digest', () => {
  it('CRON_SECRET 불일치 시 401을 반환한다', async () => {
    const res = await GET(makeGetRequest('wrong'))
    expect(res.status).toBe(401)
  })

  it('이벤트가 있으면 push를 발송하고 sentUsers=1을 반환한다', async () => {
    setupHappyPath()
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).sentUsers).toBe(1)
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })
})
