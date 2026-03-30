'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useCalendars } from '@/hooks/useCalendars'
import {
  getEventsByMonth,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  createEvent,
  updateEvent,
  deleteEvent,
  getReminders,
  setReminders,
  type CalendarEvent,
} from '@/lib/calendar'
import { CalendarFilter } from '@/components/calendar/CalendarFilter'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { DayEventsSheet } from '@/components/calendar/DayEventsSheet'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'
import { EventFormModal } from '@/components/calendar/EventFormModal'
import { CalendarFormModal } from '@/components/calendar/CalendarFormModal'
import { BottomNav } from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import type { Calendar } from '@/lib/calendar'

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const { calendars, loading: calLoading, reload: reloadCalendars } = useCalendars(familyId)
  const router = useRouter()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<{ event?: CalendarEvent; date?: Date } | null>(null)
  const [calendarForm, setCalendarForm] = useState<{ calendar?: Calendar } | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  // activeIds가 빈 Set이면 전체 캘린더 표시 (useEffect 없이 처리)

  const loadEvents = () => {
    if (!familyId) return
    getEventsByMonth(familyId, year, month)
      .then(setEvents)
      .catch((e) => console.error('[CalendarPage] loadEvents failed:', e))
  }

  useEffect(() => {
    if (!familyId) return
    loadEvents()

    const channel = supabase
      .channel(`family_events_${familyId}_${year}_${month}`)
      .on('broadcast', { event: 'refresh' }, loadEvents)
      .subscribe()
    channelRef.current = channel

    return () => { supabase.removeChannel(channel) }
  }, [familyId, year, month])

  const broadcast = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
  }

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
    setSelectedDate(null)
  }

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
    setSelectedDate(null)
  }

  // 빈 Set = 전체 활성. 하나를 끄면 나머지 전부를 Set에 담음
  const toggleCalendar = (id: string) => {
    setActiveIds((prev) => {
      if (prev.size === 0) {
        // 전체 활성 상태에서 하나를 비활성화
        return new Set(calendars.map((c) => c.id).filter((cid) => cid !== id))
      }
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === calendars.length) return new Set() // 다시 전체 활성
      } else {
        next.add(id)
        if (next.size === calendars.length) return new Set() // 다시 전체 활성
      }
      return next
    })
  }

  // ── Calendar CRUD ─────────────────────────────────────────

  const handleCalendarSave = async (name: string, color: string) => {
    if (!familyId || !user) return
    if (calendarForm?.calendar) {
      await updateCalendar(calendarForm.calendar.id, { name, color })
    } else {
      await createCalendar(familyId, user.id, name, color)
    }
    reloadCalendars()
  }

  const handleCalendarDelete = async () => {
    if (!calendarForm?.calendar) return
    await deleteCalendar(calendarForm.calendar.id)
    setActiveIds((prev) => {
      const next = new Set(prev)
      next.delete(calendarForm.calendar!.id)
      return next
    })
    reloadCalendars()
  }

  // ── Event CRUD ────────────────────────────────────────────

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

    await loadEvents()
    broadcast()
  }

  const handleEventDelete = async () => {
    if (!selectedEvent) return
    await deleteEvent(selectedEvent.id)
    setSelectedEvent(null)
    await loadEvents()
    broadcast()
  }

  const openEditEvent = async () => {
    if (!selectedEvent) return
    setEditingEvent({ event: selectedEvent })
    setSelectedEvent(null)
  }

  const loading = authLoading || familyLoading || calLoading

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col bg-white dark:bg-stone-950" style={{ height: '100dvh' }}>
      {/* 헤더 */}
      <div className="px-4 pt-8 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {year}년 {month + 1}월
          </h1>
          <button onClick={nextMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 캘린더 필터 */}
        <CalendarFilter
          calendars={calendars}
          activeIds={activeIds}
          onToggle={toggleCalendar}
          onAdd={() => setCalendarForm({})}
          onEdit={(cal) => setCalendarForm({ calendar: cal })}
        />
      </div>

      {/* 달력 그리드 — 남은 공간 꽉 채움 */}
      <CalendarGrid
        year={year}
        month={month}
        events={events}
        calendars={calendars}
        activeIds={activeIds}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate((prev) =>
            prev?.toDateString() === date.toDateString() ? null : date
          )
        }}
        className="flex-1 overflow-hidden pb-16"
      />

      {/* FAB */}
      <button
        onClick={() => setEditingEvent({ date: selectedDate ?? today })}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-orange-400 hover:bg-orange-500 text-white shadow-lg flex items-center justify-center transition-colors z-30"
      >
        <Plus size={24} />
      </button>

      {/* 날짜 클릭 → 일정 리스트 */}
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

      {/* 일정 상세 */}
      {selectedEvent && !editingEvent && (
        <EventDetailSheet
          event={selectedEvent}
          calendars={calendars}
          onClose={() => setSelectedEvent(null)}
          onEdit={openEditEvent}
          onDelete={handleEventDelete}
        />
      )}

      {/* 일정 생성/편집 */}
      {editingEvent && (
        <EventFormModalWithReminders
          event={editingEvent.event}
          date={editingEvent.date}
          calendars={calendars}
          onClose={() => setEditingEvent(null)}
          onSave={handleEventSave}
        />
      )}

      {/* 캘린더 생성/편집 */}
      {calendarForm !== null && (
        <CalendarFormModal
          initial={calendarForm.calendar}
          onClose={() => setCalendarForm(null)}
          onSave={handleCalendarSave}
          onDelete={calendarForm.calendar ? handleCalendarDelete : undefined}
        />
      )}

      <BottomNav />
    </div>
  )
}

// 편집 시 기존 알림 로드를 위한 래퍼
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
  // 새 일정이면 즉시 [] 로 초기화, 편집이면 로드 완료 후 설정
  const [reminderMinutes, setReminderMinutes] = useState<number[] | null>(event ? null : [])

  useEffect(() => {
    if (!event) return
    getReminders(event.id)
      .then((r) => setReminderMinutes(r.map((x) => x.remind_minutes_before)))
      .catch(() => setReminderMinutes([]))
  }, [event?.id])

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
