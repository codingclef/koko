'use client'

import type { Calendar, CalendarEvent } from '@/lib/calendar'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface DayCell {
  date: Date
  isCurrentMonth: boolean
}

function buildGrid(year: number, month: number): { cells: DayCell[]; rows: number } {
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthLastDay = new Date(year, month, 0).getDate()

  const rows = Math.ceil((startDow + daysInMonth) / 7)
  const totalCells = rows * 7

  const cells: DayCell[] = []

  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }
  const remaining = totalCells - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
  }
  return { cells, rows }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getEventsForDay(date: Date, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => isSameDay(new Date(e.start_at), date))
}

interface Props {
  year: number
  month: number
  events: CalendarEvent[]
  calendars: Calendar[]
  activeIds: Set<string>
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  className?: string
}

export function CalendarGrid({ year, month, events, calendars, activeIds, selectedDate, onSelectDate, className }: Props) {
  const { cells, rows } = buildGrid(year, month)
  const today = new Date()

  const calendarMap = new Map(calendars.map((c) => [c.id, c]))

  // activeIds가 빈 Set이면 전체 표시
  const visibleEvents = events.filter(
    (e) => activeIds.size === 0 || !e.calendar_id || activeIds.has(e.calendar_id)
  )

  const getEventColor = (event: CalendarEvent): string => {
    if (!event.calendar_id) return '#94a3b8'
    return calendarMap.get(event.calendar_id)?.color ?? '#94a3b8'
  }

  return (
    <div className={`flex flex-col w-full ${className ?? ''}`}>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 shrink-0">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1.5 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-stone-400 dark:text-stone-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 — 행 수만큼만 생성 */}
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {cells.map((cell, idx) => {
          const dayEvents = getEventsForDay(cell.date, visibleEvents)
          const isToday = isSameDay(cell.date, today)
          const isSelected = selectedDate ? isSameDay(cell.date, selectedDate) : false
          const dow = cell.date.getDay()
          const isSun = dow === 0
          const isSat = dow === 6

          return (
            <button
              key={idx}
              onClick={() => onSelectDate(cell.date)}
              className={`relative flex flex-col items-start p-0.5 border-t transition-colors ${
                isSelected
                  ? 'bg-orange-50 dark:bg-orange-950/30'
                  : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
              } border-stone-100 dark:border-stone-800`}
            >
              {/* 날짜 숫자 */}
              <span
                className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mx-auto mb-0.5 ${
                  isToday
                    ? 'bg-orange-400 text-white font-bold'
                    : !cell.isCurrentMonth
                    ? 'text-stone-300 dark:text-stone-600'
                    : isSun
                    ? 'text-red-400 dark:text-red-400'
                    : isSat
                    ? 'text-blue-400 dark:text-blue-400'
                    : 'text-stone-700 dark:text-stone-200'
                }`}
              >
                {cell.date.getDate()}
              </span>

              {/* 일정 pills */}
              <div className="w-full space-y-0.5 px-0.5">
                {dayEvents.slice(0, 3).map((evt) => (
                  <div
                    key={evt.id}
                    className="w-full rounded text-white text-[9px] leading-tight px-1 py-0.5 truncate"
                    style={{ backgroundColor: getEventColor(evt) }}
                  >
                    {evt.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-stone-400 px-1">+{dayEvents.length - 3}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
