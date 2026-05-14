'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import KoreanLunarCalendar from 'korean-lunar-calendar'
import type { Calendar, CalendarEvent } from '@/lib/calendar'
import { toDisplayColor } from '@/lib/label-colors'
import type { Holiday } from '@/lib/holidays'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DATE_HEADER_HEIGHT = 28  // px – date circle (h-6=24) + mb-0.5 (2) + border (1) ≈ 28
const LUNAR_DATE_HEIGHT = 12   // px – text-[9px] leading-tight (9 × 1.25 ≈ 12)
const LANE_HEIGHT = 18         // px – bar (16) + gap (2)
const WEEKDAY_HEADER_HEIGHT = 28
const CELL_VERTICAL_CHROME = 5 // p-0.5 top/bottom + border-t
const CHIP_HEIGHT = 17        // text-[10px] leading-tight + py-0.5
const CHIP_GAP = 2            // space-y-0.5
const HOLIDAY_EVENT_GAP = 2

interface DayCell {
  date: Date
  isCurrentMonth: boolean
}

export function buildGrid(year: number, month: number): DayCell[] {
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
  const trailingDays = totalCells - cells.length
  for (let d = 1; d <= trailingDays; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
  }
  return cells
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function isMultiDayAllDay(event: CalendarEvent): boolean {
  if (!event.is_all_day || !event.end_at) return false
  return dateOnly(new Date(event.end_at)) > dateOnly(new Date(event.start_at))
}

export function isEventOnDate(event: CalendarEvent, date: Date): boolean {
  const target = dateOnly(date)
  const start = dateOnly(new Date(event.start_at))
  if (isMultiDayAllDay(event)) {
    const end = dateOnly(new Date(event.end_at!))
    return target >= start && target <= end
  }
  return target.getTime() === start.getTime()
}

function getChipStyle(isAllDay: boolean, color: string): CSSProperties {
  if (isAllDay) return { backgroundColor: color }
  return { backgroundColor: color + '26', color }
}

export function getHolidayBlockHeight(holidayCount: number): number {
  if (holidayCount <= 0) return 0
  return holidayCount * CHIP_HEIGHT + Math.max(0, holidayCount - 1) * CHIP_GAP
}

export function getHolidayOverlayOffset(holidayCount: number): number {
  if (holidayCount <= 0) return 0
  return getHolidayBlockHeight(holidayCount) + HOLIDAY_EVENT_GAP
}

export function getRowHolidayOverlayOffset(holidayCountsByColumn: number[]): number {
  return holidayCountsByColumn.reduce(
    (maxOffset, count) => Math.max(maxOffset, getHolidayOverlayOffset(count)),
    0
  )
}

export function getSingleEventDisplayBudget({
  rowHeight,
  dateHeaderHeight,
  laneAreaHeight,
  holidayCount,
  hasHolidaysAndEvents,
  singleEventCount,
}: {
  rowHeight: number | null
  dateHeaderHeight: number
  laneAreaHeight: number
  holidayCount: number
  hasHolidaysAndEvents: boolean
  singleEventCount: number
}): { visibleCount: number; showOverflow: boolean } {
  if (singleEventCount <= 0) return { visibleCount: 0, showOverflow: false }
  if (rowHeight === null || rowHeight <= 0) {
    const visibleCount = Math.min(3, singleEventCount)
    return { visibleCount, showOverflow: singleEventCount > visibleCount }
  }

  const reservedHeight =
    CELL_VERTICAL_CHROME +
    dateHeaderHeight +
    laneAreaHeight +
    holidayCount * CHIP_HEIGHT +
    Math.max(0, holidayCount - 1) * CHIP_GAP +
    (hasHolidaysAndEvents ? HOLIDAY_EVENT_GAP : 0)
  const availableHeight = Math.max(0, rowHeight - reservedHeight)
  const availableLines = availableHeight >= CHIP_HEIGHT
    ? Math.floor((availableHeight + CHIP_GAP) / (CHIP_HEIGHT + CHIP_GAP))
    : 0

  if (availableLines <= 0) return { visibleCount: 0, showOverflow: false }
  if (singleEventCount <= availableLines) {
    return { visibleCount: singleEventCount, showOverflow: false }
  }

  // Leave one visible line for the "+N" overflow indicator.
  return { visibleCount: Math.max(0, availableLines - 1), showOverflow: true }
}

interface EventSegment {
  event: CalendarEvent
  colStart: number // 0–6 within this row
  colSpan: number  // 1–7
  lane: number
  isStart: boolean // first visible segment of the event
  isEnd: boolean   // last visible segment of the event
}

export function computeSegments(row: DayCell[], multiDayEvents: CalendarEvent[]): EventSegment[] {
  if (multiDayEvents.length === 0 || row.length < 7) return []
  const rowStart = dateOnly(row[0].date)
  const rowEnd = dateOnly(row[6].date)

  const segments: EventSegment[] = []

  for (const event of multiDayEvents) {
    const eventStart = dateOnly(new Date(event.start_at))
    const eventEnd = dateOnly(new Date(event.end_at!))

    if (eventEnd < rowStart || eventStart > rowEnd) continue

    // Clamp to row bounds
    const segStart = eventStart < rowStart ? rowStart : eventStart
    const segEnd = eventEnd > rowEnd ? rowEnd : eventEnd
    const colStart = segStart.getDay()
    const colSpan = segEnd.getDay() - colStart + 1

    segments.push({
      event,
      colStart,
      colSpan,
      lane: 0,
      isStart: isSameDay(segStart, eventStart),
      isEnd: isSameDay(segEnd, eventEnd),
    })
  }

  // Precompute sort keys to avoid repeated dateOnly() calls inside comparator
  const sortKeys = new Map(multiDayEvents.map((e) => {
    const start = dateOnly(new Date(e.start_at)).getTime()
    const dur = e.end_at ? dateOnly(new Date(e.end_at)).getTime() - start : 0
    return [e.id, { start, dur }]
  }))

  // Stable sort: start asc → duration desc → id asc
  segments.sort((a, b) => {
    const ak = sortKeys.get(a.event.id)!
    const bk = sortKeys.get(b.event.id)!
    return ak.start - bk.start || bk.dur - ak.dur || a.event.id.localeCompare(b.event.id)
  })

  // Greedy lane assignment
  const laneEndCol: number[] = []
  for (const seg of segments) {
    let lane = laneEndCol.findIndex((end) => end < seg.colStart)
    if (lane === -1) {
      lane = laneEndCol.length
      laneEndCol.push(-1)
    }
    seg.lane = lane
    laneEndCol[lane] = seg.colStart + seg.colSpan - 1
  }

  return segments
}

export function computeLaneHeightsByColumn(segments: EventSegment[]): number[] {
  const heights = Array.from({ length: 7 }, () => 0)

  for (const seg of segments) {
    const laneHeight = (seg.lane + 1) * LANE_HEIGHT
    const endCol = seg.colStart + seg.colSpan
    for (let col = seg.colStart; col < endCol; col += 1) {
      if (laneHeight > heights[col]) heights[col] = laneHeight
    }
  }

  return heights
}

export function computeReservedLaneHeightsByColumn(
  segments: EventSegment[],
  rowHolidayOffset: number,
  holidayCountsByColumn: number[]
): number[] {
  const heights = Array.from({ length: 7 }, () => 0)

  for (const seg of segments) {
    const segmentBottom = rowHolidayOffset + (seg.lane + 1) * LANE_HEIGHT
    const endCol = seg.colStart + seg.colSpan
    for (let col = seg.colStart; col < endCol; col += 1) {
      const reservedHeight = Math.max(0, segmentBottom - getHolidayBlockHeight(holidayCountsByColumn[col] ?? 0))
      if (reservedHeight > heights[col]) heights[col] = reservedHeight
    }
  }

  return heights
}


interface Props {
  year: number
  month: number
  events: CalendarEvent[]
  calendars: Calendar[]
  activeIds: Set<string>
  holidays?: Holiday[]
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  showLunar?: boolean
  className?: string
}

export function CalendarGrid({
  year, month, events, calendars, activeIds,
  holidays = [], selectedDate, onSelectDate, showLunar = false, className,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const weekdayHeaderRef = useRef<HTMLDivElement>(null)
  const [gridMetrics, setGridMetrics] = useState({
    height: 0,
    weekdayHeaderHeight: WEEKDAY_HEADER_HEIGHT,
  })
  const cells = useMemo(() => buildGrid(year, month), [year, month])
  const today = useMemo(() => new Date(), [])
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])

  const visibleEvents = useMemo(
    () => events.filter((e) => activeIds.size === 0 || !e.calendar_id || activeIds.has(e.calendar_id)),
    [events, activeIds]
  )

  // Single pass: avoids calling isMultiDayAllDay twice per event
  const { multiDayEvents, singleDayEvents } = useMemo(() => {
    const multi: CalendarEvent[] = []
    const single: CalendarEvent[] = []
    for (const e of visibleEvents) {
      if (isMultiDayAllDay(e)) multi.push(e)
      else single.push(e)
    }
    return { multiDayEvents: multi, singleDayEvents: single }
  }, [visibleEvents])

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    for (const h of holidays) {
      const arr = map.get(h.date)
      if (arr) arr.push(h)
      else map.set(h.date, [h])
    }
    return map
  }, [holidays])

  const singleEventsByDate = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const e of singleDayEvents) {
      const key = dateOnly(new Date(e.start_at)).getTime()
      const arr = map.get(key)
      if (arr) arr.push(e)
      else map.set(key, [e])
    }
    return map
  }, [singleDayEvents])

  const getEventColor = (event: CalendarEvent): string => {
    if (event.label_color) return toDisplayColor(event.label_color)
    const calColor = event.calendar_id ? calendarMap.get(event.calendar_id)?.color : null
    return calColor ? toDisplayColor(calColor) : '#94a3b8'
  }

  const lunarDateMap = useMemo(() => {
    if (!showLunar) return new Map<number, string>()
    const map = new Map<number, string>()
    const calendar = new KoreanLunarCalendar()
    for (const cell of cells) {
      calendar.setSolarDate(cell.date.getFullYear(), cell.date.getMonth() + 1, cell.date.getDate())
      const lunar = calendar.getLunarCalendar()
      map.set(cell.date.getTime(), `${lunar.month}/${lunar.day}`)
    }
    return map
  }, [showLunar, cells])

  const rows = useMemo(() => {
    const result: DayCell[][] = []
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7))
    return result
  }, [cells])

  const effectiveDateHeaderHeight = DATE_HEADER_HEIGHT + (showLunar ? LUNAR_DATE_HEIGHT : 0)
  const rowHeight = gridMetrics.height > 0
    ? Math.max(0, (gridMetrics.height - gridMetrics.weekdayHeaderHeight) / rows.length)
    : null

  useEffect(() => {
    const measure = () => {
      const height = gridRef.current?.getBoundingClientRect().height ?? 0
      const weekdayHeaderHeight =
        weekdayHeaderRef.current?.getBoundingClientRect().height || WEEKDAY_HEADER_HEIGHT

      setGridMetrics((prev) => (
        prev.height === height && prev.weekdayHeaderHeight === weekdayHeaderHeight
          ? prev
          : { height, weekdayHeaderHeight }
      ))
    }

    measure()
    window.addEventListener('resize', measure)

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    if (gridRef.current) observer.observe(gridRef.current)
    if (weekdayHeaderRef.current) observer.observe(weekdayHeaderRef.current)

    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [rows.length])

  return (
    <div
      ref={gridRef}
      data-testid="calendar-grid"
      className={`w-full grid ${className ?? ''}`}
      style={{ gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))`, height: '100%' }}
    >
      {/* 요일 헤더 — auto 트랙 */}
      <div ref={weekdayHeaderRef} className="grid grid-cols-7">
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

      {/* 주 단위 행 — minmax(0,1fr) 트랙 */}
      {rows.map((row, rowIdx) => {
        const segments = computeSegments(row, multiDayEvents)
        const holidayCountsByColumn = row.map((cell) => {
          const d = cell.date
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return holidaysByDate.get(ymd)?.length ?? 0
        })
        const rowHolidayOffset = getRowHolidayOverlayOffset(holidayCountsByColumn)
        const laneHeightsByColumn = computeReservedLaneHeightsByColumn(
          segments,
          rowHolidayOffset,
          holidayCountsByColumn
        )

        return (
            <div key={rowIdx} className="relative min-h-0">
              {/* 날짜 셀 그리드 */}
              <div className="grid grid-cols-7 h-full min-h-0">
                {row.map((cell, colIdx) => {
                  const daySingleEvents = singleEventsByDate.get(cell.date.getTime()) ?? []
                  const d = cell.date
                  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  const dayHolidays = holidaysByDate.get(ymd) ?? []
                  const isToday = isSameDay(cell.date, today)
                  const isSelected = selectedDate ? isSameDay(cell.date, selectedDate) : false
                  const dow = cell.date.getDay()
                  const isSun = dow === 0
                  const isSat = dow === 6
                  const hasHolidaysAndEvents = dayHolidays.length > 0 && daySingleEvents.length > 0
                  const laneAreaHeight = laneHeightsByColumn[colIdx] ?? 0
                  const singleEventDisplay = getSingleEventDisplayBudget({
                    rowHeight,
                    dateHeaderHeight: effectiveDateHeaderHeight,
                    laneAreaHeight,
                    holidayCount: dayHolidays.length,
                    hasHolidaysAndEvents,
                    singleEventCount: daySingleEvents.length,
                  })
                  const visibleSingleEvents = daySingleEvents.slice(0, singleEventDisplay.visibleCount)
                  const hiddenSingleEventCount = daySingleEvents.length - visibleSingleEvents.length

                  return (
                    <button
                      key={colIdx}
                      onClick={() => onSelectDate(cell.date)}
                      aria-label={`${cell.date.getFullYear()}년 ${cell.date.getMonth() + 1}월 ${cell.date.getDate()}일`}
                      className={`relative flex flex-col items-start p-0.5 border-t transition-colors min-h-0 overflow-hidden ${
                        isSelected
                          ? 'bg-accent-50 dark:bg-accent-950/30'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      } border-stone-100 dark:border-stone-800`}
                    >
                      {/* 날짜 숫자 */}
                      <div className="flex flex-col items-center mx-auto mb-0.5">
                        <span
                          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday
                              ? 'bg-accent-400 text-white font-bold'
                              : isSelected
                              ? 'underline underline-offset-2 decoration-accent-400 font-bold ' + (
                                  !cell.isCurrentMonth
                                    ? 'text-stone-400 dark:text-stone-400'
                                    : isSun
                                    ? 'text-red-400'
                                    : isSat
                                    ? 'text-blue-400'
                                    : 'text-stone-700 dark:text-stone-200'
                                )
                              : !cell.isCurrentMonth
                              ? 'text-stone-400 dark:text-stone-400'
                              : isSun
                              ? 'text-red-400 dark:text-red-400'
                              : isSat
                              ? 'text-blue-400 dark:text-blue-400'
                              : 'text-stone-700 dark:text-stone-200'
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>
                        {showLunar && (
                          <span className={`text-[9px] leading-tight ${
                            !cell.isCurrentMonth
                              ? 'text-stone-400 dark:text-stone-400'
                              : 'text-stone-400 dark:text-stone-500'
                          }`}>
                            {lunarDateMap.get(cell.date.getTime())}
                          </span>
                        )}
                      </div>

                      {/* 공휴일 chips */}
                      <div className="w-full space-y-0.5">
                        {dayHolidays.map((h) => (
                          <div
                            key={`${h.countryCode}-${h.date}`}
                            className="w-full rounded text-white text-[10px] leading-tight px-1 py-0.5 overflow-hidden whitespace-nowrap bg-red-400"
                          >
                            {h.localName}
                          </div>
                        ))}
                      </div>

                      {/* 멀티데이 lane 공간 확보용 spacer */}
                      <div
                        aria-hidden="true"
                        data-testid={`lane-spacer-${ymd}`}
                        style={{ height: laneAreaHeight }}
                      />

                      {/* 단일 일정 pills */}
                      <div className={`w-full space-y-0.5${hasHolidaysAndEvents ? ' mt-0.5' : ''}`}>
                        {visibleSingleEvents.map((evt) => {
                          const color = getEventColor(evt)
                          return (
                            <div
                              key={evt.id}
                              className={`w-full rounded text-[10px] leading-tight px-1 py-0.5 overflow-hidden whitespace-nowrap${evt.is_all_day ? ' text-white' : ''}`}
                              style={getChipStyle(evt.is_all_day, color)}
                            >
                              {evt.title}
                            </div>
                          )
                        })}
                        {singleEventDisplay.showOverflow && hiddenSingleEventCount > 0 && (
                          <div className="text-[10px] text-stone-500 dark:text-stone-400 font-medium px-1">
                            +{hiddenSingleEventCount}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* 멀티데이 이벤트 overlay */}
              {segments.length > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 pointer-events-none"
                  style={{ top: effectiveDateHeaderHeight + rowHolidayOffset }}
                >
                  {segments.map((seg) => {
                    const color = getEventColor(seg.event)
                    const s = seg.isStart ? '4px' : '0'
                    const e = seg.isEnd ? '4px' : '0'
                    const borderRadius = `${s} ${e} ${e} ${s}`

                    return (
                      <div
                        key={`${seg.event.id}-row${rowIdx}`}
                        data-testid={`multi-segment-${seg.event.id}-row${rowIdx}`}
                        className="absolute px-0.5 pointer-events-none"
                        style={{
                          left: `${(seg.colStart / 7) * 100}%`,
                          width: `${(seg.colSpan / 7) * 100}%`,
                          top: seg.lane * LANE_HEIGHT,
                          height: 16,
                        }}
                      >
                        <button
                          type="button"
                          title={seg.event.title}
                          className="w-full h-full flex items-center justify-center gap-0.5 text-white text-[10px] overflow-hidden whitespace-nowrap pointer-events-auto"
                          style={{
                            backgroundColor: color,
                            borderRadius,
                            paddingLeft: seg.isStart ? 4 : 0,
                            paddingRight: seg.isEnd ? 4 : 0,
                          }}
                          onClick={() => onSelectDate(dateOnly(new Date(seg.event.start_at)))}
                        >
                          {!seg.isStart && <span className="shrink-0 opacity-70">‹</span>}
                          <span className="overflow-hidden min-w-0">{seg.event.title}</span>
                          {!seg.isEnd && <span className="shrink-0 opacity-70">›</span>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
