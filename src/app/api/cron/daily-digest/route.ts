import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'

type EventRow = {
  id: string
  family_id: string
  calendar_id: string | null
  title: string
  start_at: string
  end_at: string | null
  is_all_day: boolean
}

type PushSubRow = { id: string; endpoint: string; p256dh: string; auth: string }

function getTodayKST(): { start: string; end: string; date: string } {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dateStr = nowKST.toISOString().slice(0, 10)
  return {
    start: `${dateStr}T00:00:00+09:00`,
    end: `${dateStr}T23:59:59+09:00`,
    date: dateStr,
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

function buildBody(events: EventRow[]): string {
  const sorted = [...events].sort((a, b) => {
    if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1
    if (a.start_at !== b.start_at) return a.start_at < b.start_at ? -1 : 1
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
  })

  const shown = sorted.slice(0, 5)
  const extra = sorted.length - shown.length
  const lines = shown.map((e) => {
    const prefix = e.is_all_day ? '하루종일' : formatTime(e.start_at)
    return `・${prefix}  ${e.title}`
  })
  if (extra > 0) lines.push(`외 ${extra}개 일정이 더 있어요`)
  return ['오늘 하루도 힘차게 달려보아요!', ...lines].join('\n')
}

async function queryTodayEvents(
  filter: { type: 'family'; ids: string[] } | { type: 'calendar'; ids: string[] },
  todayStart: string,
  todayEnd: string
): Promise<EventRow[]> {
  const base = supabaseAdmin
    .from('events')
    .select('id, family_id, calendar_id, title, start_at, end_at, is_all_day')
    .eq('is_cancelled', false)
    .lte('start_at', todayEnd)
    .or([
      `and(is_all_day.eq.true,end_at.gte.${todayStart})`,      // 멀티데이 종일
      `and(is_all_day.eq.true,end_at.is.null,start_at.gte.${todayStart})`, // 단일 종일
      `and(is_all_day.eq.false,start_at.gte.${todayStart})`,   // 시간 이벤트
    ].join(','))

  const query =
    filter.type === 'family'
      ? base.in('family_id', filter.ids).is('calendar_id', null)
      : base.in('calendar_id', filter.ids)

  const { data, error } = await query
  if (error) throw new Error(`queryTodayEvents failed: ${error.message}`)
  return (data ?? []) as EventRow[]
}

async function handleDailyDigest(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { start: todayStart, end: todayEnd, date: sentDate } = getTodayKST()

  const { data: subRows, error: subError } = await supabaseAdmin.from('push_subscriptions').select('user_id')
  if (subError) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  const allUserIds = [...new Set((subRows ?? []).map((r) => r.user_id).filter(Boolean))] as string[]
  if (allUserIds.length === 0) return NextResponse.json({ sentUsers: 0, skippedUsers: 0 })

  const { data: sentLogs, error: sentLogsError } = await supabaseAdmin
    .from('daily_digest_log')
    .select('user_id')
    .eq('sent_date', sentDate)
    .in('user_id', allUserIds)
  if (sentLogsError) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  const alreadySentSet = new Set((sentLogs ?? []).map((r) => r.user_id))
  const pendingUserIds = allUserIds.filter((id) => !alreadySentSet.has(id))
  if (pendingUserIds.length === 0) return NextResponse.json({ sentUsers: 0, skippedUsers: allUserIds.length })

  const [memberRows, calMemberRows, allSubsRows] = await Promise.all([
    supabaseAdmin.from('family_members').select('user_id, family_id').in('user_id', pendingUserIds),
    supabaseAdmin.from('calendar_members').select('user_id, calendar_id').in('user_id', pendingUserIds),
    supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id').in('user_id', pendingUserIds),
  ])
  if (memberRows.error || calMemberRows.error || allSubsRows.error) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const userFamilyMap = new Map<string, string>()
  for (const row of memberRows.data ?? []) {
    if (row.user_id && row.family_id) userFamilyMap.set(row.user_id, row.family_id)
  }

  const userCalendarMap = new Map<string, string[]>()
  for (const row of calMemberRows.data ?? []) {
    if (!row.user_id || !row.calendar_id) continue
    const arr = userCalendarMap.get(row.user_id) ?? []
    arr.push(row.calendar_id)
    userCalendarMap.set(row.user_id, arr)
  }

  const familyIds = [...new Set([...userFamilyMap.values()])]
  const calendarIds = [...new Set([...userCalendarMap.values()].flat())]

  let familyEvents: EventRow[], calEvents: EventRow[]
  try {
    ;[familyEvents, calEvents] = await Promise.all([
      familyIds.length > 0 ? queryTodayEvents({ type: 'family', ids: familyIds }, todayStart, todayEnd) : Promise.resolve([]),
      calendarIds.length > 0 ? queryTodayEvents({ type: 'calendar', ids: calendarIds }, todayStart, todayEnd) : Promise.resolve([]),
    ])
  } catch {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // end_at=null 종일 이벤트는 DB .or() 필터를 통과하므로 메모리에서 보정
  const allEvents = [...familyEvents, ...calEvents].filter((e) => {
    if (!e.is_all_day) return true
    return (e.end_at ?? e.start_at) >= todayStart
  })

  const subsByUser = new Map<string, PushSubRow[]>()
  for (const sub of allSubsRows.data ?? []) {
    if (!sub.user_id) continue
    const { user_id: _uid, ...pushSub } = sub
    const arr = subsByUser.get(sub.user_id) ?? []
    arr.push(pushSub)
    subsByUser.set(sub.user_id, arr)
  }

  let sentUsers = 0
  let skippedUsers = 0

  await Promise.all(
    pendingUserIds.map(async (userId) => {
      const familyId = userFamilyMap.get(userId)
      const myCalendarIds = new Set(userCalendarMap.get(userId) ?? [])
      const userSubs = subsByUser.get(userId)
      if (!userSubs?.length) { skippedUsers++; return }

      const visibleEvents = allEvents.filter(
        (e) => e.family_id === familyId && (e.calendar_id === null || myCalendarIds.has(e.calendar_id))
      )
      if (visibleEvents.length === 0) { skippedUsers++; return }

      const payload = JSON.stringify({
        title: '오늘의 일정',
        body: buildBody(visibleEvents),
        tag: 'koko-daily-digest',
        url: '/',
      })

      // ignoreDuplicates: true → 충돌 시 빈 배열, 실제 오류 시 error 필드로 구분
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('daily_digest_log')
        .upsert({ user_id: userId, sent_date: sentDate }, { onConflict: 'user_id,sent_date', ignoreDuplicates: true })
        .select('user_id')
      if (insertError) {
        console.error('[daily-digest] log insert failed for user:', userId, insertError)
        skippedUsers++
        return
      }
      if (!inserted || inserted.length === 0) { skippedUsers++; return } // 다른 실행이 이미 선점

      try {
        const { sent } = await dispatchPushNotifications(userSubs, payload)
        if (sent === 0) {
          await supabaseAdmin.from('daily_digest_log').delete().eq('user_id', userId).eq('sent_date', sentDate)
          skippedUsers++
        } else {
          sentUsers++
        }
      } catch (err) {
        console.error('[daily-digest] push failed for user:', userId, err)
        await supabaseAdmin.from('daily_digest_log').delete().eq('user_id', userId).eq('sent_date', sentDate)
        skippedUsers++
      }
    })
  )

  return NextResponse.json({ sentUsers, skippedUsers })
}

export async function GET(req: NextRequest) {
  return handleDailyDigest(req)
}

export async function POST(req: NextRequest) {
  return handleDailyDigest(req)
}
