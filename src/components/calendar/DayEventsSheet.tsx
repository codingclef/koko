'use client'

import { Plus, X } from 'lucide-react'
import type { Calendar, CalendarEvent } from '@/lib/calendar'
import { isEventOnDate } from '@/components/calendar/CalendarGrid'

function formatHHMM(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatTimeRange(startAt: string, endAt: string | null, isAllDay: boolean): string {
  if (isAllDay) return '종일'
  const start = formatHHMM(startAt)
  if (!endAt) return start
  return `${start}~${formatHHMM(endAt)}`
}

function formatDate(date: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`
}

interface Props {
  date: Date
  events: CalendarEvent[]
  calendars: Calendar[]
  onClose: () => void
  onSelectEvent: (event: CalendarEvent) => void
  onAddEvent: () => void
}

export function DayEventsSheet({ date, events, calendars, onClose, onSelectEvent, onAddEvent }: Props) {
  const calendarMap = new Map(calendars.map((c) => [c.id, c]))

  const dayEvents = events.filter((e) => isEventOnDate(e, date))

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-2xl max-h-[60vh] flex flex-col pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200 dark:bg-stone-700" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="font-bold text-stone-800 dark:text-stone-100">{formatDate(date)}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddEvent}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              <Plus size={13} />
              일정 추가
            </button>
            <button onClick={onClose} className="p-2 text-stone-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 일정 목록 */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {dayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-stone-400 text-sm">이 날의 일정이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((evt) => {
                const cal = evt.calendar_id ? calendarMap.get(evt.calendar_id) : null
                return (
                  <button
                    key={evt.id}
                    onClick={() => onSelectEvent(evt)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-left transition-colors"
                  >
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: evt.label_color ?? cal?.color ?? '#94a3b8' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                        {evt.title}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5 tabular-nums">
                        {formatTimeRange(evt.start_at, evt.end_at, evt.is_all_day)}
                        {cal && <span className="ml-2">{cal.name}</span>}
                      </p>
                      {evt.description && (
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 leading-relaxed">
                          {evt.description}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
