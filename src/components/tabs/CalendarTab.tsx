'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCalendars } from '@/hooks/useCalendars'
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
  createEvent,
  updateEvent,
  deleteEvent,
  getReminders,
  setReminders,
  type CalendarEvent,
  type FamilyMember,
} from '@/lib/calendar'
import { CalendarFilter } from '@/components/calendar/CalendarFilter'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { CalendarListSheet } from '@/components/calendar/CalendarListSheet'
import { DayEventsSheet } from '@/components/calendar/DayEventsSheet'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'
import { EventFormModal } from '@/components/calendar/EventFormModal'
import { CalendarFormModal } from '@/components/calendar/CalendarFormModal'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import type { Calendar } from '@/lib/calendar'

interface Props extends AuthState {
  preferences: UserPreferences | null
}

const monthEventsCache = new Map<string, CalendarEvent[]>()
const monthEventsRequests = new Map<string, Promise<CalendarEvent[]>>()

export function clearMonthEventsCacheForTests() {
  monthEventsCache.clear()
  monthEventsRequests.clear()
}

function getMonthEventsKey(familyId: string, year: number, month: number) {
  return `${familyId}:${year}:${month}`
}

function clearFamilyMonthEventsCache(familyId: string) {
  const prefix = `${familyId}:`

  for (const key of monthEventsCache.keys()) {
    if (key.startsWith(prefix)) monthEventsCache.delete(key)
  }

  for (const key of monthEventsRequests.keys()) {
    if (key.startsWith(prefix)) monthEventsRequests.delete(key)
  }
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

async function fetchMonthEvents(
  familyId: string,
  year: number,
  month: number,
  options: { force?: boolean } = {}
) {
  const key = getMonthEventsKey(familyId, year, month)

  if (!options.force) {
    const cached = monthEventsCache.get(key)
    if (cached) return cached

    const inFlight = monthEventsRequests.get(key)
    if (inFlight) return inFlight
  }

  const request = getEventsByMonth(familyId, year, month)
    .then((nextEvents) => {
      monthEventsCache.set(key, nextEvents)
      monthEventsRequests.delete(key)
      return nextEvents
    })
    .catch((error) => {
      monthEventsRequests.delete(key)
      throw error
    })

  monthEventsRequests.set(key, request)
  return request
}

export function CalendarTab({ preferences, user, familyId, isInitializing }: Props) {
  const {
    calendars,
    loading: calLoading,
    error: calendarsError,
    reload: reloadCalendars,
  } = useCalendars(familyId)

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
  const [mutationError, setMutationError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  const [slideKey, setSlideKey] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)

  const isModalOpen = selectedDate !== null || selectedEvent !== null || editingEvent !== null || calendarForm !== null

  const {
    value: familyMembers,
    loading: familyMembersLoading,
    error: familyMembersError,
    reload: reloadFamilyMembers,
  } = useAsyncData<FamilyMember[]>({
    enabled: Boolean(familyId),
    initialValue: [],
    reloadKey: familyId,
    load: () => getFamilyMembers(familyId!),
    onError: (e) => console.error('[CalendarTab] getFamilyMembers failed:', e),
  })

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<unknown>(null)
  const [hasLoadedEvents, setHasLoadedEvents] = useState(false)

  const prefetchAdjacentMonths = useCallback((targetYear: number, targetMonth: number) => {
    if (!familyId) return

    const prev = getAdjacentMonth(targetYear, targetMonth, -1)
    const next = getAdjacentMonth(targetYear, targetMonth, 1)

    void fetchMonthEvents(familyId, prev.year, prev.month).catch(() => {})
    void fetchMonthEvents(familyId, next.year, next.month).catch(() => {})
  }, [familyId])

  useEffect(() => {
    setEvents([])
    setEventsError(null)
    setEventsLoading(true)
    setHasLoadedEvents(false)
  }, [familyId])

  useEffect(() => {
    if (!familyId) {
      setEvents([])
      setEventsError(null)
      setEventsLoading(false)
      return
    }

    const key = getMonthEventsKey(familyId, year, month)
    const cached = monthEventsCache.get(key)
    let cancelled = false

    if (cached) {
      setEvents(cached)
      setEventsError(null)
      setEventsLoading(false)
      setHasLoadedEvents(true)
      prefetchAdjacentMonths(year, month)
      return
    }

    setEvents([])
    setEventsError(null)
    setEventsLoading(true)

    void fetchMonthEvents(familyId, year, month)
      .then((nextEvents) => {
        if (cancelled) return
        setEvents(nextEvents)
        setEventsError(null)
        setEventsLoading(false)
        setHasLoadedEvents(true)
        prefetchAdjacentMonths(year, month)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[CalendarTab] loadEvents failed:', error)
        setEvents([])
        setEventsError(error)
        setEventsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [familyId, month, prefetchAdjacentMonths, year])

  const reloadEvents = useCallback(async () => {
    if (!familyId) return

    setEventsLoading(true)
    try {
      const nextEvents = await fetchMonthEvents(familyId, year, month, { force: true })
      setEvents(nextEvents)
      setEventsError(null)
      setHasLoadedEvents(true)
      prefetchAdjacentMonths(year, month)
    } catch (error) {
      console.error('[CalendarTab] loadEvents failed:', error)
      setEvents([])
      setEventsError(error)
      throw error
    } finally {
      setEventsLoading(false)
    }
  }, [familyId, month, prefetchAdjacentMonths, year])

  const refreshEvents = useCallback(async () => {
    if (!familyId) return

    try {
      const nextEvents = await fetchMonthEvents(familyId, year, month, { force: true })
      setEvents(nextEvents)
      setEventsError(null)
      setHasLoadedEvents(true)
    } catch (e) {
      console.error('[CalendarTab] refreshEvents failed:', e)
    }
  }, [familyId, year, month, setEvents])

  const reloadCalendarContext = useCallback(async () => {
    await Promise.allSettled([reloadCalendars(), reloadFamilyMembers()])
  }, [reloadCalendars, reloadFamilyMembers])

  const channelName = familyId ? `family_events_${familyId}_${year}_${month}` : null
  const broadcast = useRealtimeSync(channelName, refreshEvents, { refreshOnSubscribed: false })

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
    setMutationError(null)

    try {
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

  const handleEventSave = async (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    isAllDay: boolean
    reminderMinutes: number[]
  }) => {
    if (!familyId || !user) return
    setMutationError(null)

    try {
      clearFamilyMonthEventsCache(familyId)

      if (editingEvent?.event) {
        await updateEvent(editingEvent.event.id, {
          calendarId: params.calendarId,
          title: params.title,
          description: params.description,
          startAt: params.startAt,
          endAt: params.endAt,
          isAllDay: params.isAllDay,
        })
        await setReminders(editingEvent.event.id, params.reminderMinutes)
      } else {
        const evt = await createEvent({
          familyId,
          userId: user.id,
          calendarId: params.calendarId,
          title: params.title,
          description: params.description,
          startAt: params.startAt,
          endAt: params.endAt,
          isAllDay: params.isAllDay,
        })
        await setReminders(evt.id, params.reminderMinutes)
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

  const handleEventDelete = async () => {
    if (!selectedEvent) return
    if (!familyId) return
    setMutationError(null)

    try {
      clearFamilyMonthEventsCache(familyId)
      await deleteEvent(selectedEvent.id)
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

  const openEditEvent = async () => {
    if (!selectedEvent) return
    setEditingEvent({ event: selectedEvent })
    setSelectedEvent(null)
  }

  const loading = isInitializing || calLoading || familyMembersLoading || (!hasLoadedEvents && eventsLoading)
  const fetchError = calendarsError || familyMembersError || eventsError

  const handleRetry = async () => {
    await Promise.all([reloadCalendars(), reloadFamilyMembers(), reloadEvents()])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="w-full min-h-screen flex flex-col bg-white dark:bg-stone-950">
        <div className="px-4 pt-8 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-2 text-stone-400 hover:text-stone-600">
              <span className="sr-only">이전 달</span>
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">
              {year}년 {month + 1}월
            </h1>
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
      className="w-full flex flex-col bg-white dark:bg-stone-950 overflow-hidden"
      style={{ height: '100dvh', touchAction: isModalOpen ? 'auto' : 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 헤더 */}
      <div className="px-4 pt-8 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <span className="sr-only">이전 달</span>
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {year}년 {month + 1}월
          </h1>
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
      </div>

      <div
        key={slideKey}
        className={`flex-1 overflow-hidden${slideDir === 'left' ? ' calendar-slide-from-right' : slideDir === 'right' ? ' calendar-slide-from-left' : ''}`}
      >
        <CalendarGrid
          year={year}
          month={month}
          events={events}
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
          className="h-full pb-16"
        />
      </div>

      <button
        onClick={() => setEditingEvent({ date: selectedDate ?? today })}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-accent-400 hover:bg-accent-500 text-white shadow-lg flex items-center justify-center transition-colors z-30"
      >
        <Plus size={24} />
      </button>

      {selectedDate && !selectedEvent && !editingEvent && !calendarForm && (
        <DayEventsSheet
          date={selectedDate}
          events={events}
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
          event={editingEvent.event}
          date={editingEvent.date}
          calendars={calendars}
          onClose={() => setEditingEvent(null)}
          onSave={handleEventSave}
        />
      )}

      {showCalendarList && (
        <CalendarListSheet
          calendars={calendars}
          familyMembers={familyMembers}
          onClose={() => setShowCalendarList(false)}
          onAdd={() => { setShowCalendarList(false); openCalendarForm() }}
          onEdit={(cal) => { setShowCalendarList(false); openCalendarForm(cal) }}
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
  calendars,
  onClose,
  onSave,
}: {
  event?: CalendarEvent
  date?: Date
  calendars: Calendar[]
  onClose: () => void
  onSave: (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    isAllDay: boolean
    reminderMinutes: number[]
  }) => Promise<void>
}) {
  const [reminderMinutes, setReminderMinutes] = useState<number[] | null>(event ? null : [])

  useEffect(() => {
    if (!event) return
    getReminders(event.id)
      .then((r) => setReminderMinutes(r.map((x) => x.remind_minutes_before)))
      .catch(() => setReminderMinutes([]))
  }, [event])

  if (reminderMinutes === null) return null

  return (
    <EventFormModal
      initial={event}
      initialDate={date}
      initialReminderMinutes={reminderMinutes}
      calendars={calendars}
      onClose={onClose}
      onSave={onSave}
    />
  )
}
