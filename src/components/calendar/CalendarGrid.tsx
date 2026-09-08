'use client'

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import KoreanLunarCalendar from 'korean-lunar-calendar'
import type { Calendar, CalendarEvent } from '@/lib/calendar'
import {
  addCalendarDays,
  buildCalendarGrid,
  CALENDAR_EVENT_LANE_HEIGHT,
  calendarDayDifference,
  computeLaneHeightsByColumn,
  computeReservedLaneHeightsByColumn,
  computeSegments,
  dateOnly,
  getSingleEventDisplayBudget,
  getMultiDayDragOffset,
  isMultiDayAllDay,
  isSameDay,
  shouldRenderMultiDayAboveHolidays,
  splitSegmentsByHolidayOffsets,
  type CalendarDayCell as DayCell,
} from '@/lib/calendar-grid'
import { toDisplayColor } from '@/lib/label-colors'
import type { Holiday } from '@/types/holidays'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DATE_HEADER_HEIGHT = 28  // px – date circle (h-6=24) + mb-0.5 (2) + border (1) ≈ 28
const LUNAR_DATE_HEIGHT = 12   // px – text-[9px] leading-tight (9 × 1.25 ≈ 12)
const WEEKDAY_HEADER_HEIGHT = 28

function getChipStyle(isAllDay: boolean, color: string): CSSProperties {
  if (isAllDay) return { backgroundColor: color }
  return { backgroundColor: color + '26', color }
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
  onMoveEvent?: (event: CalendarEvent, date: Date) => void
  movingEventId?: string | null
  onEventDragStateChange?: (dragging: boolean) => void
  showLunar?: boolean
  className?: string
}

function DroppableDay({
  date,
  disabled,
  dragPreview,
  className,
  ariaLabel,
  onClick,
  children,
}: {
  date: Date
  disabled: boolean
  dragPreview: 'start' | 'range' | null
  className: string
  ariaLabel: string
  onClick: () => void
  children: ReactNode
}) {
  const { setNodeRef } = useDroppable({
    id: `date:${date.getTime()}`,
    data: { date },
    disabled,
  })

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      aria-label={ariaLabel}
      data-drag-preview={dragPreview ?? undefined}
      className={`${className}${
        dragPreview === 'start'
          ? ' bg-accent-100/70 ring-1 ring-inset ring-accent-400/50 dark:bg-accent-950/50 dark:ring-accent-400/60'
          : dragPreview === 'range'
            ? ' bg-accent-100/40 dark:bg-accent-950/30'
            : ''
      }`}
    >
      {children}
    </button>
  )
}

function DraggableEventChip({
  event,
  color,
  disabled,
}: {
  event: CalendarEvent
  color: string
  disabled: boolean
}) {
  const { isDragging, listeners, setNodeRef } = useDraggable({
    id: `event:${event.id}`,
    data: { event },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-event-id={event.id}
      data-draggable={!disabled}
      className={`w-full select-none rounded text-[10px] leading-tight px-1 py-0.5 overflow-hidden whitespace-nowrap${event.is_all_day ? ' text-white' : ''}${isDragging ? ' opacity-30' : ''}`}
      style={{ ...getChipStyle(event.is_all_day, color), WebkitTouchCallout: 'none' }}
      onContextMenu={(event) => {
        if (!disabled) event.preventDefault()
      }}
    >
      {event.title}
    </div>
  )
}

function DraggableMultiDaySegment({
  event,
  dragId,
  segmentStart,
  segmentDayCount,
  disabled,
  className,
  style,
  onClick,
  children,
}: {
  event: CalendarEvent
  dragId: string
  segmentStart: Date
  segmentDayCount: number
  disabled: boolean
  className: string
  style: CSSProperties
  onClick: () => void
  children: ReactNode
}) {
  const { isDragging, listeners, setNodeRef } = useDraggable({
    id: dragId,
    data: { event, segmentStart, segmentDayCount },
    disabled,
  })

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      title={event.title}
      data-event-id={event.id}
      data-draggable={!disabled}
      data-multi-day="true"
      className={`${className}${isDragging ? ' opacity-30' : ''}`}
      style={{ ...style, WebkitTouchCallout: 'none' }}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!disabled) event.preventDefault()
      }}
    >
      {children}
    </button>
  )
}

export function CalendarGrid({
  year, month, events, calendars, activeIds,
  holidays = [], selectedDate, onSelectDate, onMoveEvent, movingEventId,
  onEventDragStateChange, showLunar = false, className,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const weekdayHeaderRef = useRef<HTMLDivElement>(null)
  const [gridMetrics, setGridMetrics] = useState({
    height: 0,
    weekdayHeaderHeight: WEEKDAY_HEADER_HEIGHT,
  })
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null)
  const [dragPreviewStart, setDragPreviewStart] = useState<Date | null>(null)
  const dragDayOffsetRef = useRef(0)
  const dragOffsetReadyRef = useRef(true)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )
  const cells = useMemo(() => buildCalendarGrid(year, month), [year, month])
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

  const handleDragStart = (dragEvent: DragStartEvent) => {
    const event = dragEvent.active.data.current?.event as CalendarEvent | undefined
    if (!event || event.series_id) return
    const segmentStart = dragEvent.active.data.current?.segmentStart as Date | undefined
    const segmentDayCount = dragEvent.active.data.current?.segmentDayCount as number | undefined
    const rect = dragEvent.active.rect.current.initial
    const activatorEvent = dragEvent.activatorEvent
    const pointerX = 'touches' in activatorEvent
      ? (activatorEvent as TouchEvent).touches[0]?.clientX
      : 'clientX' in activatorEvent
        ? (activatorEvent as MouseEvent).clientX
        : undefined

    const hasUsablePointer = rect && pointerX !== undefined &&
      rect.width > 0 && pointerX >= rect.left && pointerX <= rect.right
    dragOffsetReadyRef.current = !isMultiDayAllDay(event) || Boolean(
      segmentStart && segmentDayCount && hasUsablePointer
    )
    dragDayOffsetRef.current = segmentStart && segmentDayCount && hasUsablePointer
      ? getMultiDayDragOffset(
          dateOnly(new Date(event.start_at)),
          segmentStart,
          segmentDayCount,
          (pointerX! - rect!.left) / rect!.width
        )
      : 0
    setDraggedEvent(event)
    setDragPreviewStart(dateOnly(new Date(event.start_at)))
    onEventDragStateChange?.(true)
  }

  const handleDragOver = (dragEvent: DragOverEvent) => {
    const date = dragEvent.over?.data.current?.date as Date | undefined
    const event = dragEvent.active.data.current?.event as CalendarEvent | undefined
    if (date && event && !dragOffsetReadyRef.current) {
      const start = dateOnly(new Date(event.start_at))
      const end = dateOnly(new Date(event.end_at!))
      if (date >= start && date <= end) {
        dragDayOffsetRef.current = calendarDayDifference(start, date)
      }
      dragOffsetReadyRef.current = true
    }
    setDragPreviewStart(date ? addCalendarDays(date, -dragDayOffsetRef.current) : null)
  }

  const handleDragEnd = (dragEvent: DragEndEvent) => {
    const event = dragEvent.active.data.current?.event as CalendarEvent | undefined
    const date = dragEvent.over?.data.current?.date as Date | undefined
    const targetStart = date ? addCalendarDays(date, -dragDayOffsetRef.current) : undefined
    setDraggedEvent(null)
    setDragPreviewStart(null)
    onEventDragStateChange?.(false)
    if (event && targetStart && !event.series_id) onMoveEvent?.(event, targetStart)
  }

  const handleDragCancel = () => {
    setDraggedEvent(null)
    setDragPreviewStart(null)
    onEventDragStateChange?.(false)
  }

  const dragPreviewEnd = draggedEvent && dragPreviewStart
    ? addCalendarDays(
        dragPreviewStart,
        isMultiDayAllDay(draggedEvent)
          ? calendarDayDifference(
              dateOnly(new Date(draggedEvent.start_at)),
              dateOnly(new Date(draggedEvent.end_at!))
            )
          : 0
      )
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
        const renderMultiDayAboveHolidays = shouldRenderMultiDayAboveHolidays(segments, holidayCountsByColumn)
        const displaySegments = renderMultiDayAboveHolidays
          ? segments.map((seg) => ({
              ...seg,
              holidayOffset: 0,
              showLeadingContinuation: !seg.isStart,
              showTrailingContinuation: !seg.isEnd,
              insetLeft: true,
              insetRight: true,
            }))
          : splitSegmentsByHolidayOffsets(segments, holidayCountsByColumn)
        const laneHeightsByColumn = renderMultiDayAboveHolidays
          ? computeLaneHeightsByColumn(segments)
          : computeReservedLaneHeightsByColumn(displaySegments, holidayCountsByColumn)

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
                  const isDragPreviewStart = dragPreviewStart
                    ? isSameDay(cell.date, dragPreviewStart)
                    : false
                  const isDragPreviewRange = dragPreviewStart && dragPreviewEnd
                    ? cell.date >= dragPreviewStart && cell.date <= dragPreviewEnd
                    : false
                  const dow = cell.date.getDay()
                  const isSun = dow === 0
                  const isSat = dow === 6
                  const hasHolidaysAndEvents = dayHolidays.length > 0 && daySingleEvents.length > 0
                  const laneAreaHeight = laneHeightsByColumn[colIdx] ?? 0
                  const holidaySpacerBefore = renderMultiDayAboveHolidays ? laneAreaHeight : 0
                  const holidaySpacerAfter = renderMultiDayAboveHolidays ? 0 : laneAreaHeight
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
                    <DroppableDay
                      key={colIdx}
                      date={cell.date}
                      disabled={!onMoveEvent || Boolean(movingEventId)}
                      dragPreview={isDragPreviewStart ? 'start' : isDragPreviewRange ? 'range' : null}
                      onClick={() => onSelectDate(cell.date)}
                      ariaLabel={`${cell.date.getFullYear()}년 ${cell.date.getMonth() + 1}월 ${cell.date.getDate()}일`}
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

                      {/* 멀티데이 lane 공간 확보용 spacer - 공휴일 위 모드 */}
                      {holidaySpacerBefore > 0 && (
                        <div
                          aria-hidden="true"
                          data-testid={`lane-spacer-${ymd}`}
                          style={{ height: holidaySpacerBefore }}
                        />
                      )}

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

                      {/* 멀티데이 lane 공간 확보용 spacer - 공휴일 아래 모드 */}
                      {holidaySpacerAfter > 0 && (
                        <div
                          aria-hidden="true"
                          data-testid={`lane-spacer-${ymd}`}
                          style={{ height: holidaySpacerAfter }}
                        />
                      )}

                      {/* 단일 일정 pills */}
                      <div className={`w-full space-y-0.5${hasHolidaysAndEvents ? ' mt-0.5' : ''}`}>
                        {visibleSingleEvents.map((evt) => {
                          const color = getEventColor(evt)
                          return (
                            <DraggableEventChip
                              key={evt.id}
                              event={evt}
                              color={color}
                              disabled={Boolean(evt.series_id) || Boolean(movingEventId)}
                            />
                          )
                        })}
                        {singleEventDisplay.showOverflow && hiddenSingleEventCount > 0 && (
                          <div className="text-[10px] text-stone-500 dark:text-stone-400 font-medium px-1">
                            +{hiddenSingleEventCount}
                          </div>
                        )}
                      </div>
                    </DroppableDay>
                  )
                })}
              </div>

              {/* 멀티데이 이벤트 overlay */}
              {displaySegments.length > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 pointer-events-none"
                  style={{ top: effectiveDateHeaderHeight }}
                >
                  {displaySegments.map((seg, segIdx) => {
                    const color = getEventColor(seg.event)
                    const s = seg.isStart ? '4px' : '0'
                    const e = seg.isEnd ? '4px' : '0'
                    const borderRadius = `${s} ${e} ${e} ${s}`

                    return (
                      <div
                        key={`${seg.event.id}-row${rowIdx}-piece${segIdx}`}
                        data-testid={`multi-segment-${seg.event.id}-row${rowIdx}-piece${segIdx}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: `${(seg.colStart / 7) * 100}%`,
                          width: `${(seg.colSpan / 7) * 100}%`,
                          top: seg.holidayOffset + seg.lane * CALENDAR_EVENT_LANE_HEIGHT,
                          height: 16,
                          paddingLeft: seg.insetLeft ? 2 : 0,
                          paddingRight: seg.insetRight ? 2 : 0,
                        }}
                      >
                        <DraggableMultiDaySegment
                          event={seg.event}
                          dragId={`multi:${seg.event.id}:${rowIdx}:${segIdx}`}
                          segmentStart={row[seg.colStart].date}
                          segmentDayCount={seg.colSpan}
                          disabled={Boolean(seg.event.series_id) || Boolean(movingEventId)}
                          className="w-full h-full flex items-center justify-center gap-0.5 text-white text-[10px] overflow-hidden whitespace-nowrap pointer-events-auto"
                          style={{
                            backgroundColor: color,
                            borderRadius,
                            paddingLeft: seg.isStart ? 4 : 0,
                            paddingRight: seg.isEnd ? 4 : 0,
                          }}
                          onClick={() => onSelectDate(dateOnly(new Date(seg.event.start_at)))}
                        >
                          {seg.showLeadingContinuation && <span className="shrink-0 opacity-70">‹</span>}
                          <span className="overflow-hidden min-w-0">{seg.event.title}</span>
                          {seg.showTrailingContinuation && <span className="shrink-0 opacity-70">›</span>}
                        </DraggableMultiDaySegment>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <DragOverlay>
        {draggedEvent ? (
          <div
            className={`max-w-36 rounded text-[10px] leading-tight px-2 py-1 overflow-hidden whitespace-nowrap shadow-lg${draggedEvent.is_all_day ? ' text-white' : ''}`}
            style={getChipStyle(draggedEvent.is_all_day, getEventColor(draggedEvent))}
          >
            {draggedEvent.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
