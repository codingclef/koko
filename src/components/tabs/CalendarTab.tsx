'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useHolidays } from '@/hooks/useHolidays'
import type { UserPreferences } from '@/lib/preferences'
import type { AuthState } from '@/types/tabs'
import {
  getEventsByMonth,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getCalendarMembers,
  setCalendarMembers,
  getFamilyMembers,
  getReminders,
  getRecurrenceRule,
  type CalendarEvent,
  type FamilyMember,
  type SaveResult,
} from '@/lib/calendar'
import { CalendarFilter } from '@/components/calendar/CalendarFilter'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { CalendarListSheet } from '@/components/calendar/CalendarListSheet'
import { DayEventsSheet } from '@/components/calendar/DayEventsSheet'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'
import { EventFormModal } from '@/components/calendar/EventFormModal'
import { CalendarFormModal } from '@/components/calendar/CalendarFormModal'
import { YearMonthPickerSheet } from '@/components/calendar/YearMonthPickerSheet'
import { RecurrenceScopeSheet } from '@/components/calendar/RecurrenceScopeSheet'
import type { RecurrenceRule, RecurrenceScope } from '@/types/recurrence'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { postJsonWithAuth, patchJsonWithAuth, deleteWithAuth } from '@/lib/api-client'
import type { Calendar } from '@/lib/calendar'

interface Props extends AuthState {
  preferences: UserPreferences | null
  updatePreferences: (updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>
  calendars: Calendar[]
  calendarsError: unknown
  reloadCalendars: () => Promise<unknown>
}

const MAX_MONTH_EVENT_CACHE = 12

function getMonthEventsKey(familyId: string, year: number, month: number) {
  return `${familyId}:${year}:${month}`
}

function calendarFilterKey(familyId: string) {
  return `koko_calendar_filter_${familyId}`
}

function readStoredFilter(familyId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(calendarFilterKey(familyId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return new Set(parsed as string[])
  } catch {
    return null
  }
}

function saveStoredFilter(familyId: string, ids: Set<string>) {
  try {
    localStorage.setItem(calendarFilterKey(familyId), JSON.stringify([...ids]))
  } catch {}
}

function getAdjacentMonth(year: number, month: number, delta: -1 | 1) {
  if (delta === -1) {
    return month === 0
      ? { year: year - 1, month: 11 }
      : { year, month: month - 1 }
  }

  return month === 11
    ? { year: year + 1, month: 0 }
    : { year, month: month + 1 }
}

function getLocalTimePart(isoString: string): string {
  const date = new Date(isoString)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function CalendarTab({
  preferences,
  updatePreferences,
  user,
  familyId,
  calendars,
  calendarsError,
  reloadCalendars,
}: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const holidays = useHolidays(year, month, preferences?.holiday_countries ?? [])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<{ event?: CalendarEvent; date?: Date } | null>(null)
  const [calendarForm, setCalendarForm] = useState<{ calendar?: Calendar } | null>(null)

  const [calendarMemberIds, setCalendarMemberIds] = useState<string[]>([])
  const [showCalendarList, setShowCalendarList] = useState(false)
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [seriesScopeTarget, setSeriesScopeTarget] = useState<{ event: CalendarEvent; mode: 'edit' | 'delete' } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const yearMonthButtonRef = useRef<HTMLButtonElement>(null)
  const filterInitializedForRef = useRef<string | null>(null)

  const [slideKey, setSlideKey] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)

  const isModalOpen = selectedDate !== null || selectedEvent !== null || editingEvent !== null || calendarForm !== null || showYearMonthPicker

  const {
    value: familyMembers,
    reload: reloadFamilyMembers,
  } = useAsyncData<FamilyMember[]>({
    enabled: Boolean(familyId),
    initialValue: [],
    reloadKey: familyId,
    load: () => getFamilyMembers(familyId!),
    onError: (e) => console.error('[CalendarTab] getFamilyMembers failed:', e),
  })

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [adjacentMonthEvents, setAdjacentMonthEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<unknown>(null)
  const monthEventsCacheRef = useRef(new Map<string, CalendarEvent[]>())
  const monthEventsRequestsRef = useRef(new Map<string, Promise<CalendarEvent[]>>())
  const previousFamilyIdRef = useRef<string | null>(familyId ?? null)
  const visibleMonthKeyRef = useRef<string | null>(familyId ? getMonthEventsKey(familyId, year, month) : null)

  const storeMonthEvents = useCallback((key: string, nextEvents: CalendarEvent[]) => {
    const cache = monthEventsCacheRef.current
    if (cache.has(key)) cache.delete(key)
    cache.set(key, nextEvents)

    while (cache.size > MAX_MONTH_EVENT_CACHE) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) break
      cache.delete(oldestKey)
    }
  }, [])

  const clearFamilyMonthEventsCache = useCallback((targetFamilyId: string) => {
    const prefix = `${targetFamilyId}:`

    for (const key of monthEventsCacheRef.current.keys()) {
      if (key.startsWith(prefix)) monthEventsCacheRef.current.delete(key)
    }

    for (const key of monthEventsRequestsRef.current.keys()) {
      if (key.startsWith(prefix)) monthEventsRequestsRef.current.delete(key)
    }
  }, [])

  const fetchMonthEvents = useCallback(async (
    targetFamilyId: string,
    targetYear: number,
    targetMonth: number,
    options: { force?: boolean } = {}
  ) => {
    const key = getMonthEventsKey(targetFamilyId, targetYear, targetMonth)

    if (!options.force) {
      const cached = monthEventsCacheRef.current.get(key)
      if (cached) return cached

      const inFlight = monthEventsRequestsRef.current.get(key)
      if (inFlight) return inFlight
    }

    const request = getEventsByMonth(targetFamilyId, targetYear, targetMonth)
      .then((nextEvents) => {
        storeMonthEvents(key, nextEvents)
        monthEventsRequestsRef.current.delete(key)
        return nextEvents
      })
      .catch((error) => {
        monthEventsRequestsRef.current.delete(key)
        throw error
      })

    monthEventsRequestsRef.current.set(key, request)
    return request
  }, [storeMonthEvents])

  const syncAdjacentFromCache = useCallback((
    targetFamilyId: string, targetYear: number, targetMonth: number
  ) => {
    const expectedKey = getMonthEventsKey(targetFamilyId, targetYear, targetMonth)
    if (visibleMonthKeyRef.current !== expectedKey) return

    const prev = getAdjacentMonth(targetYear, targetMonth, -1)
    const next = getAdjacentMonth(targetYear, targetMonth, 1)
    const prevEvents = monthEventsCacheRef.current.get(
      getMonthEventsKey(targetFamilyId, prev.year, prev.month)
    ) ?? []
    const nextEvents = monthEventsCacheRef.current.get(
      getMonthEventsKey(targetFamilyId, next.year, next.month)
    ) ?? []
    setAdjacentMonthEvents([...prevEvents, ...nextEvents])
  }, [])

  const prefetchAdjacentMonths = useCallback((targetFamilyId: string, targetYear: number, targetMonth: number) => {
    const prev = getAdjacentMonth(targetYear, targetMonth, -1)
    const next = getAdjacentMonth(targetYear, targetMonth, 1)

    void Promise.all([
      fetchMonthEvents(targetFamilyId, prev.year, prev.month).catch(() => {}),
      fetchMonthEvents(targetFamilyId, next.year, next.month).catch(() => {}),
    ]).then(() => {
      syncAdjacentFromCache(targetFamilyId, targetYear, targetMonth)
    })
  }, [fetchMonthEvents, syncAdjacentFromCache])

  const loadMonthEvents = useCallback(async ({
    targetFamilyId,
    targetYear,
    targetMonth,
    force = false,
    silent = false,
    throwOnError = false,
  }: {
    targetFamilyId: string
    targetYear: number
    targetMonth: number
    force?: boolean
    silent?: boolean
    throwOnError?: boolean
  }) => {
    const key = getMonthEventsKey(targetFamilyId, targetYear, targetMonth)
    const cached = !force ? monthEventsCacheRef.current.get(key) : undefined
    const isVisibleMonth = () => visibleMonthKeyRef.current === key
    const applyMonthState = (nextEvents: CalendarEvent[], nextError: unknown = null) => {
      if (!isVisibleMonth()) return
      setEvents(nextEvents)
      setEventsError(nextError)
      setEventsLoading(false)
    }

    if (cached) {
      applyMonthState(cached)
      syncAdjacentFromCache(targetFamilyId, targetYear, targetMonth)
      prefetchAdjacentMonths(targetFamilyId, targetYear, targetMonth)
      return cached
    }

    if (!silent && isVisibleMonth()) {
      setEvents([])
      setAdjacentMonthEvents([])
      setEventsLoading(true)
    }
    if (isVisibleMonth()) setEventsError(null)

    try {
      const nextEvents = await fetchMonthEvents(targetFamilyId, targetYear, targetMonth, { force })
      applyMonthState(nextEvents)
      syncAdjacentFromCache(targetFamilyId, targetYear, targetMonth)
      prefetchAdjacentMonths(targetFamilyId, targetYear, targetMonth)
      return nextEvents
    } catch (error) {
      console.error('[CalendarTab] loadEvents failed:', error)
      if (isVisibleMonth()) {
        setEvents([])
        setAdjacentMonthEvents([])
        setEventsError(error)
        setEventsLoading(false)
      }
      if (throwOnError) throw error
      return []
    }
  }, [fetchMonthEvents, prefetchAdjacentMonths, syncAdjacentFromCache])

  useEffect(() => {
    if (!familyId || calendars.length === 0) return
    if (filterInitializedForRef.current === familyId) return

    const stored = readStoredFilter(familyId)
    const calendarIdSet = new Set(calendars.map((c) => c.id))
    const validIds = stored
      ? new Set([...stored].filter((id) => calendarIdSet.has(id)))
      : new Set<string>()
    const targetFamilyId = familyId

    queueMicrotask(() => {
      filterInitializedForRef.current = targetFamilyId
      setActiveIds(validIds)
    })
  }, [familyId, calendars])

  useEffect(() => {
    if (!familyId || filterInitializedForRef.current !== familyId) return
    saveStoredFilter(familyId, activeIds)
  }, [familyId, activeIds])

  useEffect(() => {
    visibleMonthKeyRef.current = familyId ? getMonthEventsKey(familyId, year, month) : null

    if (!familyId) {
      queueMicrotask(() => {
        setEvents([])
        setAdjacentMonthEvents([])
        setEventsError(null)
        setEventsLoading(false)
      })
      previousFamilyIdRef.current = null
      return
    }

    const familyChanged = previousFamilyIdRef.current !== familyId
    previousFamilyIdRef.current = familyId

    if (familyChanged) {
      queueMicrotask(() => {
        setEvents([])
        setAdjacentMonthEvents([])
        setEventsError(null)
        setEventsLoading(true)
      })
    }

    queueMicrotask(() => {
      void loadMonthEvents({
        targetFamilyId: familyId,
        targetYear: year,
        targetMonth: month,
      })
    })
  }, [familyId, year, month, loadMonthEvents])

  const mergedEvents = useMemo(() => {
    if (adjacentMonthEvents.length === 0) return events
    const seen = new Set(events.map((e) => e.id))
    return [...events, ...adjacentMonthEvents.filter((e) => !seen.has(e.id))]
  }, [events, adjacentMonthEvents])

  const filteredEvents = useMemo(
    () => mergedEvents.filter((e) => activeIds.size === 0 || !e.calendar_id || activeIds.has(e.calendar_id)),
    [mergedEvents, activeIds]
  )

  const reloadEvents = useCallback(async () => {
    if (!familyId) return
    await loadMonthEvents({
      targetFamilyId: familyId,
      targetYear: year,
      targetMonth: month,
      force: true,
      throwOnError: true,
    })
  }, [familyId, year, month, loadMonthEvents])

  const refreshEvents = useCallback(async () => {
    if (!familyId) return
    const prefix = `${familyId}:`
    for (const key of monthEventsCacheRef.current.keys()) {
      if (key.startsWith(prefix)) monthEventsCacheRef.current.delete(key)
    }
    for (const key of monthEventsRequestsRef.current.keys()) {
      if (key.startsWith(prefix)) monthEventsRequestsRef.current.delete(key)
    }
    await loadMonthEvents({
      targetFamilyId: familyId,
      targetYear: year,
      targetMonth: month,
      force: true,
      silent: true,
    })
  }, [familyId, year, month, loadMonthEvents])

  const reloadCalendarContext = useCallback(async () => {
    await Promise.allSettled([reloadCalendars(), reloadFamilyMembers()])
  }, [reloadCalendars, reloadFamilyMembers])

  const channelName = familyId ? `family_events_${familyId}` : null
  const broadcast = useRealtimeSync(channelName, refreshEvents)

  const prevMonth = () => {
    setSlideDir('right')
    setSlideKey((k) => k + 1)
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
    setSelectedDate(null)
  }

  const nextMonth = () => {
    setSlideDir('left')
    setSlideKey((k) => k + 1)
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
    setSelectedDate(null)
  }

  const closeYearMonthPicker = () => setShowYearMonthPicker(false)

  const handleYearMonthConfirm = (nextYear: number, nextMonth: number) => {
    setShowYearMonthPicker(false)
    if (nextYear === year && nextMonth === month) return
    setSlideKey((k) => k + 1)
    setSlideDir(null)
    setYear(nextYear)
    setMonth(nextMonth)
    setSelectedDate(null)
  }

  const { onTouchStart, onTouchEnd } = useSwipe({
    onSwipeLeft: nextMonth,
    onSwipeRight: prevMonth,
  })

  const toggleCalendar = (id: string) => {
    setActiveIds((prev) => {
      if (prev.size === 0) {
        return new Set(calendars.map((c) => c.id).filter((cid) => cid !== id))
      }
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === calendars.length) return new Set()
      } else {
        next.add(id)
        if (next.size === calendars.length) return new Set()
      }
      return next
    })
  }

  const openCalendarForm = async (calendar?: Calendar) => {
    setMutationError(null)

    if (calendar) {
      try {
        const members = await getCalendarMembers(calendar.id)
        setCalendarMemberIds(members.map((m) => m.user_id))
      } catch (e) {
        console.error('[CalendarTab] getCalendarMembers failed:', e)
        setMutationError('캘린더 멤버를 불러오지 못했어요')
        return
      }
    } else {
      setCalendarMemberIds([])
    }
    setCalendarForm(calendar ? { calendar } : {})
  }

  const handleCalendarSave = async (name: string, color: string, memberUserIds: string[]) => {
    if (!familyId || !user) return
    setMutationError(null)

    try {
      if (calendarForm?.calendar) {
        await updateCalendar(calendarForm.calendar.id, { name, color })
        await setCalendarMembers(calendarForm.calendar.id, user.id, memberUserIds)
      } else {
        await createCalendar(familyId, user.id, name, color, memberUserIds)
      }

      await reloadCalendarContext()
    } catch (e) {
      console.error('[CalendarTab] handleCalendarSave failed:', e)
      setMutationError('캘린더를 저장하지 못했어요')
      await reloadCalendarContext()
      throw e
    }
  }

  const handleCalendarDelete = async () => {
    if (!calendarForm?.calendar) return
    if (!familyId) return
    setMutationError(null)

    try {
      clearFamilyMonthEventsCache(familyId)
      await deleteCalendar(calendarForm.calendar.id)
      setActiveIds((prev) => {
        const next = new Set(prev)
        next.delete(calendarForm.calendar!.id)
        return next
      })
      await Promise.allSettled([reloadCalendarContext(), refreshEvents()])
    } catch (e) {
      console.error('[CalendarTab] handleCalendarDelete failed:', e)
      setMutationError('캘린더를 삭제하지 못했어요')
      await Promise.allSettled([reloadCalendarContext(), refreshEvents()])
      throw e
    }
  }

  /** CalendarDetailScreen 에서 기존 캘린더 수정 시 사용 */
  const handleCalendarUpdate = async (
    calendarId: string,
    name: string,
    color: string,
    memberUserIds: string[] | null,
  ): Promise<SaveResult> => {
    if (!user) return { status: 'success' }
    setMutationError(null)

    // 기본 정보 저장 실패 → 전체 실패 (throw)
    try {
      await updateCalendar(calendarId, { name, color })
    } catch (e) {
      console.error('[CalendarTab] handleCalendarUpdate failed:', e)
      setMutationError('캘린더를 저장하지 못했어요')
      await reloadCalendarContext()
      throw e
    }

    // memberUserIds 가 null 이면 멤버 로드 실패 상태 — setCalendarMembers skip
    if (memberUserIds !== null) {
      try {
        await setCalendarMembers(calendarId, user.id, memberUserIds)
      } catch (e) {
        console.error('[CalendarTab] setCalendarMembers failed:', e)
        await reloadCalendarContext()
        return { status: 'partial' }
      }
    }

    await reloadCalendarContext()
    return { status: 'success' }
  }

  /** CalendarDetailScreen 에서 캘린더 삭제 시 사용 */
  const handleCalendarDeleteById = async (calendarId: string) => {
    if (!familyId) return
    setMutationError(null)

    try {
      clearFamilyMonthEventsCache(familyId)
      await deleteCalendar(calendarId)
      setActiveIds((prev) => {
        const next = new Set(prev)
        next.delete(calendarId)
        return next
      })
      await Promise.allSettled([reloadCalendarContext(), refreshEvents()])
    } catch (e) {
      console.error('[CalendarTab] handleCalendarDeleteById failed:', e)
      setMutationError('캘린더를 삭제하지 못했어요')
      await Promise.allSettled([reloadCalendarContext(), refreshEvents()])
      throw e
    }
  }

  const handleEventSave = async (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    localStartDate: string
    localEndDate: string
    isAllDay: boolean
    reminderMinutes: number[]
    recurrence: import('@/types/recurrence').RecurrenceRule | null
    labelColor: string | null
    scope?: RecurrenceScope
  }) => {
    if (!familyId) return
    setMutationError(null)

    try {
      clearFamilyMonthEventsCache(familyId)

      const saveLastLabelColor = (color: string | null, prev: string | null = null) => {
        if (color !== null && color !== prev) {
          updatePreferences({ last_label_color: color }).catch(() => {})
        }
      }

      if (editingEvent?.event) {
        const prevLabelColor = editingEvent.event.label_color ?? null
        const scope = (editingEvent.event as CalendarEvent & { _seriesScope?: RecurrenceScope })._seriesScope ?? params.scope ?? 'single'
        const isScopedSeriesEdit = Boolean(editingEvent.event.series_id && scope !== 'single')
        const isFollowingDateChange = Boolean(
          isScopedSeriesEdit &&
          scope === 'following' &&
          editingEvent.event.series_occurrence_date &&
          params.localStartDate !== editingEvent.event.series_occurrence_date
        )
        const isFollowingRecurrenceChange = Boolean(
          isScopedSeriesEdit &&
          scope === 'following' &&
          params.recurrence
        )
        const shouldSplitFollowingSeries = isFollowingDateChange || isFollowingRecurrenceChange
        await Promise.all([
          patchJsonWithAuth(`/api/events/${editingEvent.event.id}`, {
            calendarId: params.calendarId,
            title: params.title,
            description: params.description,
            startAt: isScopedSeriesEdit && !shouldSplitFollowingSeries ? undefined : params.startAt,
            endAt: isScopedSeriesEdit && !shouldSplitFollowingSeries ? undefined : params.endAt,
            localStartDate: params.localStartDate,
            localEndDate: params.localEndDate,
            isAllDay: params.isAllDay,
            reminderMinutes: params.reminderMinutes,
            labelColor: params.labelColor,
            ...(isFollowingRecurrenceChange ? { recurrence: params.recurrence } : {}),
            ...(isScopedSeriesEdit && !params.isAllDay ? {
              startTime: getLocalTimePart(params.startAt),
              endTime: params.endAt ? getLocalTimePart(params.endAt) : null,
            } : {}),
            ...(editingEvent.event.series_id ? {
              scope,
              anchorOccurrenceDate: editingEvent.event.series_occurrence_date,
            } : {}),
          }),
          Promise.resolve(saveLastLabelColor(params.labelColor, prevLabelColor)),
        ])
      } else {
        await Promise.all([
          postJsonWithAuth('/api/events', {
            calendarId: params.calendarId,
            title: params.title,
            description: params.description,
            startAt: params.startAt,
            endAt: params.endAt,
            isAllDay: params.isAllDay,
            reminderMinutes: params.reminderMinutes,
            labelColor: params.labelColor,
            ...(params.recurrence ? { recurrence: params.recurrence } : {}),
          }),
          Promise.resolve(saveLastLabelColor(params.labelColor)),
        ])
      }

      await refreshEvents()
      broadcast()
    } catch (e) {
      console.error('[CalendarTab] handleEventSave failed:', e)
      setMutationError('일정을 저장하지 못했어요')
      await refreshEvents()
      throw e
    }
  }

  const handleEventDelete = async (scope?: RecurrenceScope, eventOverride?: CalendarEvent) => {
    const targetEvent = eventOverride ?? selectedEvent
    if (!targetEvent || !familyId) return
    setMutationError(null)

    // Series event: show scope picker if no scope provided
    if (targetEvent.series_id && !scope) {
      setSeriesScopeTarget({ event: targetEvent, mode: 'delete' })
      return
    }

    try {
      clearFamilyMonthEventsCache(familyId)

      const url = targetEvent.series_id && scope
        ? `/api/events/${targetEvent.id}?scope=${scope}&anchorOccurrenceDate=${targetEvent.series_occurrence_date ?? ''}`
        : `/api/events/${targetEvent.id}`

      await deleteWithAuth(url)
      setSelectedEvent(null)
      await refreshEvents()
      broadcast()
    } catch (e) {
      console.error('[CalendarTab] handleEventDelete failed:', e)
      setMutationError('일정을 삭제하지 못했어요')
      await refreshEvents()
      throw e
    }
  }

  const handleSeriesScopeSelect = async (scope: RecurrenceScope) => {
    const target = seriesScopeTarget
    setSeriesScopeTarget(null)
    if (!target) return

    if (target.mode === 'delete') {
      await handleEventDelete(scope, target.event)
    } else {
      // mode === 'edit': open edit form with scope context
      setEditingEvent({ event: { ...target.event, _seriesScope: scope } as CalendarEvent & { _seriesScope: RecurrenceScope } })
      setSelectedEvent(null)
    }
  }

  const openEditEvent = async () => {
    if (!selectedEvent) return

    // Series event: show scope picker first
    if (selectedEvent.series_id) {
      setSeriesScopeTarget({ event: selectedEvent, mode: 'edit' })
      setSelectedEvent(null)
      return
    }

    setEditingEvent({ event: selectedEvent })
    setSelectedEvent(null)
  }

  const fetchError = calendarsError

  const handleRetry = async () => {
    await Promise.all([reloadCalendars(), reloadFamilyMembers(), reloadEvents()])
  }

  if (fetchError) {
    return (
      <div className="w-full min-h-screen flex flex-col bg-white dark:bg-stone-950">
        <div className="px-4 pt-2 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-2 text-stone-400 hover:text-stone-600">
              <span className="sr-only">이전 달</span>
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-bold text-stone-800 dark:text-stone-100">
              {year}년 {month + 1}월
            </span>
            <button onClick={nextMonth} className="p-2 text-stone-400 hover:text-stone-600">
              <span className="sr-only">다음 달</span>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">📡</div>
          <p className="text-stone-600 dark:text-stone-300 font-medium">캘린더를 불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">잠시 후 다시 시도해주세요</p>
          <button
            onClick={handleRetry}
            className="mt-6 px-4 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 text-white font-semibold text-sm transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-0 flex flex-col bg-white dark:bg-stone-950 overflow-hidden"
      style={{ touchAction: isModalOpen ? 'auto' : 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 헤더 */}
      <div data-testid="calendar-tab-header" className="px-4 pt-2 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <button onClick={prevMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <span className="sr-only">이전 달</span>
            <ChevronLeft size={20} />
          </button>
          <button
            ref={yearMonthButtonRef}
            onClick={() => setShowYearMonthPicker((v) => !v)}
            className="flex items-center gap-1 text-lg font-bold text-stone-800 dark:text-stone-100"
          >
            {year}년 {month + 1}월
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${showYearMonthPicker ? 'rotate-180' : ''}`}
            />
          </button>
          <button onClick={nextMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <span className="sr-only">다음 달</span>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <CalendarFilter
              calendars={calendars}
              activeIds={activeIds}
              onToggle={toggleCalendar}
              onAdd={() => openCalendarForm()}
              onEdit={(cal) => openCalendarForm(cal)}
            />
          </div>
          <button
            onClick={() => setShowCalendarList(true)}
            className="shrink-0 p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
            aria-label="캘린더 리스트"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        {mutationError && (
          <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
            {mutationError}
          </div>
        )}

        {!eventsLoading && Boolean(eventsError) && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-600 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
            이번 달 일정을 불러오지 못했어요.
            <button onClick={() => void handleRetry()} className="ml-2 font-semibold underline underline-offset-2">
              다시 시도
            </button>
          </div>
        )}
      </div>

      <div
        key={slideKey}
        className={`flex-1 min-h-0 flex flex-col overflow-hidden${slideDir === 'left' ? ' calendar-slide-from-right' : slideDir === 'right' ? ' calendar-slide-from-left' : ''}`}
      >
        <CalendarGrid
          year={year}
          month={month}
          events={mergedEvents}
          calendars={calendars}
          activeIds={activeIds}
          holidays={holidays}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate((prev) =>
              prev?.toDateString() === date.toDateString() ? null : date
            )
          }}
          showLunar={preferences?.show_lunar ?? false}
          className="flex-1 min-h-0"
        />
      </div>

      <button
        aria-label="일정 추가"
        onClick={() => setEditingEvent({ date: selectedDate ?? today })}
        className="absolute right-4 bottom-4 w-11 h-11 rounded-full bg-accent-400 hover:bg-accent-500 text-white shadow-lg flex items-center justify-center transition-colors z-30"
      >
        <Plus size={18} />
      </button>

      {selectedDate && !selectedEvent && !editingEvent && !calendarForm && (
        <DayEventsSheet
          date={selectedDate}
          events={filteredEvents}
          calendars={calendars}
          onClose={() => setSelectedDate(null)}
          onSelectEvent={setSelectedEvent}
          onAddEvent={() => setEditingEvent({ date: selectedDate })}
        />
      )}

      {selectedEvent && !editingEvent && (
        <EventDetailSheet
          event={selectedEvent}
          calendars={calendars}
          onClose={() => setSelectedEvent(null)}
          onEdit={openEditEvent}
          onDelete={handleEventDelete}
        />
      )}

      {editingEvent && (
        <EventFormModalWithReminders
          key={editingEvent.event
            ? `${editingEvent.event.id}:${(editingEvent.event as CalendarEvent & { _seriesScope?: RecurrenceScope })._seriesScope ?? 'single'}`
            : 'new'}
          event={editingEvent.event}
          date={editingEvent.date}
          defaultLabelColor={preferences?.last_label_color ?? null}
          calendars={calendars}
          onClose={() => setEditingEvent(null)}
          onSave={handleEventSave}
        />
      )}

      {seriesScopeTarget && (
        <RecurrenceScopeSheet
          mode={seriesScopeTarget.mode}
          onSelect={handleSeriesScopeSelect}
          onClose={() => setSeriesScopeTarget(null)}
        />
      )}

      {showYearMonthPicker && (
        <YearMonthPickerSheet
          year={year}
          month={month}
          anchorRef={yearMonthButtonRef}
          onConfirm={handleYearMonthConfirm}
          onClose={closeYearMonthPicker}
        />
      )}

      {showCalendarList && user && (
        <CalendarListSheet
          calendars={calendars}
          familyMembers={familyMembers}
          currentUserId={user.id}
          onClose={() => setShowCalendarList(false)}
          onAdd={() => { setShowCalendarList(false); openCalendarForm() }}
          onSave={handleCalendarUpdate}
          onDelete={handleCalendarDeleteById}
        />
      )}

      {calendarForm !== null && user && (
        <CalendarFormModal
          initial={calendarForm.calendar}
          initialMemberIds={calendarForm.calendar ? calendarMemberIds : undefined}
          familyMembers={familyMembers}
          currentUserId={user.id}
          onClose={() => setCalendarForm(null)}
          onSave={handleCalendarSave}
          onDelete={calendarForm.calendar ? handleCalendarDelete : undefined}
        />
      )}
    </div>
  )
}

function EventFormModalWithReminders({
  event,
  date,
  defaultLabelColor,
  calendars,
  onClose,
  onSave,
}: {
  event?: CalendarEvent
  date?: Date
  defaultLabelColor?: string | null
  calendars: Calendar[]
  onClose: () => void
  onSave: (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    localStartDate: string
    localEndDate: string
    isAllDay: boolean
    reminderMinutes: number[]
    recurrence: import('@/types/recurrence').RecurrenceRule | null
    labelColor: string | null
    scope?: RecurrenceScope
  }) => Promise<void>
}) {
  const [reminderMinutes, setReminderMinutes] = useState<number[] | null>(event ? null : [])
  const recurrenceScope = (event as (CalendarEvent & { _seriesScope?: RecurrenceScope }) | undefined)?._seriesScope
  const shouldLoadRecurrence = Boolean(event?.series_id && recurrenceScope === 'following')
  const [initialRecurrence, setInitialRecurrence] = useState<RecurrenceRule | null | undefined>(
    shouldLoadRecurrence ? undefined : null
  )

  useEffect(() => {
    if (!event) return
    getReminders(event.id)
      .then((r) => setReminderMinutes(r.map((x) => x.remind_minutes_before)))
      .catch(() => setReminderMinutes([]))
  }, [event])

  useEffect(() => {
    if (!event?.series_id || recurrenceScope !== 'following') return

    getRecurrenceRule(event.series_id)
      .then((rule) => setInitialRecurrence(rule))
      .catch(() => setInitialRecurrence(null))
  }, [event?.series_id, recurrenceScope])

  if (reminderMinutes === null || initialRecurrence === undefined) return null

  return (
    <EventFormModal
      initial={event}
      initialDate={date}
      initialReminderMinutes={reminderMinutes}
      initialRecurrence={initialRecurrence}
      recurrenceScope={recurrenceScope}
      defaultLabelColor={defaultLabelColor}
      calendars={calendars}
      onClose={onClose}
      onSave={onSave}
    />
  )
}
