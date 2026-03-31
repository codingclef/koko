'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useCalendars } from '@/hooks/useCalendars'
import { useHolidays } from '@/hooks/useHolidays'
import type { UserPreferences } from '@/lib/preferences'
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
import { supabase } from '@/lib/supabase'
import type { Calendar } from '@/lib/calendar'

interface Props {
  preferences: UserPreferences | null
}

export function CalendarTab({ preferences }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const { calendars, loading: calLoading, reload: reloadCalendars } = useCalendars(familyId)
  const router = useRouter()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const holidays = useHolidays(year, month, preferences?.holiday_countries ?? [])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<{ event?: CalendarEvent; date?: Date } | null>(null)
  const [calendarForm, setCalendarForm] = useState<{ calendar?: Calendar } | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [slideKey, setSlideKey] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)

  const isModalOpen = selectedDate !== null || selectedEvent !== null || editingEvent !== null || calendarForm !== null

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])


  const loadEvents = useCallback(() => {
    if (!familyId) return
    getEventsByMonth(familyId, year, month)
      .then(setEvents)
      .catch((e) => console.error('[CalendarTab] loadEvents failed:', e))
  }, [familyId, year, month])

  useEffect(() => {
    if (!familyId) return
    loadEvents()

    const channel = supabase
      .channel(`family_events_${familyId}_${year}_${month}`)
      .on('broadcast', { event: 'refresh' }, loadEvents)
      .subscribe()
    channelRef.current = channel

    return () => { supabase.removeChannel(channel) }
  }, [familyId, year, month, loadEvents])

  const broadcast = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
  }

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
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {year}년 {month + 1}월
          </h1>
          <button onClick={nextMonth} className="p-2 text-stone-400 hover:text-stone-600">
            <ChevronRight size={20} />
          </button>
        </div>

        <CalendarFilter
          calendars={calendars}
          activeIds={activeIds}
          onToggle={toggleCalendar}
          onAdd={() => setCalendarForm({})}
          onEdit={(cal) => setCalendarForm({ calendar: cal })}
        />
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
          className="h-full pb-16"
        />
      </div>

      <button
        onClick={() => setEditingEvent({ date: selectedDate ?? today })}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-orange-400 hover:bg-orange-500 text-white shadow-lg flex items-center justify-center transition-colors z-30"
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

      {calendarForm !== null && (
        <CalendarFormModal
          initial={calendarForm.calendar}
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
