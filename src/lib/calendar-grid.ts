import type { CalendarEvent } from '@/lib/calendar'

export interface CalendarDayCell {
  date: Date
  isCurrentMonth: boolean
}

export const CALENDAR_EVENT_LANE_HEIGHT = 18
const CELL_VERTICAL_CHROME = 5
const CHIP_HEIGHT = 17
const CHIP_GAP = 2
const HOLIDAY_EVENT_GAP = 2

export interface EventSegment {
  event: CalendarEvent
  colStart: number
  colSpan: number
  lane: number
  isStart: boolean
  isEnd: boolean
}

export interface DisplaySegment extends EventSegment {
  holidayOffset: number
  showLeadingContinuation: boolean
  showTrailingContinuation: boolean
  insetLeft: boolean
  insetRight: boolean
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function dateOnly(d: Date): Date {
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

export function getHolidayBlockHeight(holidayCount: number): number {
  if (holidayCount <= 0) return 0
  return holidayCount * CHIP_HEIGHT + Math.max(0, holidayCount - 1) * CHIP_GAP
}

export function getHolidayOverlayOffset(holidayCount: number): number {
  if (holidayCount <= 0) return 0
  return getHolidayBlockHeight(holidayCount) + HOLIDAY_EVENT_GAP
}

export function shouldRenderMultiDayAboveHolidays(
  segments: EventSegment[],
  holidayCountsByColumn: number[]
): boolean {
  let streakStart = -1

  for (let col = 0; col <= holidayCountsByColumn.length; col += 1) {
    const hasHoliday = col < holidayCountsByColumn.length && (holidayCountsByColumn[col] ?? 0) > 0

    if (hasHoliday) {
      if (streakStart === -1) streakStart = col
      continue
    }

    if (streakStart === -1) continue

    const streakEnd = col
    if (streakEnd - streakStart >= 2) {
      const crossesHolidayStreak = segments.some((segment) => (
        segment.colStart < streakStart &&
        segment.colStart + segment.colSpan > streakStart &&
        segment.colStart + segment.colSpan >= streakEnd
      ))
      if (crossesHolidayStreak) return true
    }

    streakStart = -1
  }

  return false
}

export function splitSegmentsByHolidayOffsets(
  segments: EventSegment[],
  holidayCountsByColumn: number[]
): DisplaySegment[] {
  const displaySegments: DisplaySegment[] = []

  for (const segment of segments) {
    const segmentEnd = segment.colStart + segment.colSpan
    let pieceStart = segment.colStart
    let currentHolidayCount = holidayCountsByColumn[pieceStart] ?? 0

    for (let col = segment.colStart + 1; col <= segmentEnd; col += 1) {
      const nextHolidayCount = col < segmentEnd ? (holidayCountsByColumn[col] ?? 0) : null
      if (nextHolidayCount === currentHolidayCount) continue

      const isPieceStart = pieceStart === segment.colStart
      const isPieceEnd = col === segmentEnd
      displaySegments.push({
        ...segment,
        colStart: pieceStart,
        colSpan: col - pieceStart,
        isStart: segment.isStart && isPieceStart,
        isEnd: segment.isEnd && isPieceEnd,
        holidayOffset: getHolidayOverlayOffset(currentHolidayCount),
        showLeadingContinuation: !segment.isStart && isPieceStart,
        showTrailingContinuation: !segment.isEnd && isPieceEnd,
        insetLeft: isPieceStart,
        insetRight: isPieceEnd,
      })

      pieceStart = col
      currentHolidayCount = nextHolidayCount ?? 0
    }
  }

  return displaySegments
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

  return { visibleCount: Math.max(0, availableLines - 1), showOverflow: true }
}

export function computeSegments(
  row: CalendarDayCell[],
  multiDayEvents: CalendarEvent[]
): EventSegment[] {
  if (multiDayEvents.length === 0 || row.length < 7) return []
  const rowStart = dateOnly(row[0].date)
  const rowEnd = dateOnly(row[6].date)
  const segments: EventSegment[] = []

  for (const event of multiDayEvents) {
    const eventStart = dateOnly(new Date(event.start_at))
    const eventEnd = dateOnly(new Date(event.end_at!))
    if (eventEnd < rowStart || eventStart > rowEnd) continue

    const segmentStart = eventStart < rowStart ? rowStart : eventStart
    const segmentEnd = eventEnd > rowEnd ? rowEnd : eventEnd
    const colStart = segmentStart.getDay()
    segments.push({
      event,
      colStart,
      colSpan: segmentEnd.getDay() - colStart + 1,
      lane: 0,
      isStart: isSameDay(segmentStart, eventStart),
      isEnd: isSameDay(segmentEnd, eventEnd),
    })
  }

  const sortKeys = new Map(multiDayEvents.map((event) => {
    const start = dateOnly(new Date(event.start_at)).getTime()
    const duration = event.end_at ? dateOnly(new Date(event.end_at)).getTime() - start : 0
    return [event.id, { start, duration }]
  }))

  segments.sort((a, b) => {
    const aKey = sortKeys.get(a.event.id)!
    const bKey = sortKeys.get(b.event.id)!
    return aKey.start - bKey.start || bKey.duration - aKey.duration || a.event.id.localeCompare(b.event.id)
  })

  const laneEndColumn: number[] = []
  for (const segment of segments) {
    let lane = laneEndColumn.findIndex((end) => end < segment.colStart)
    if (lane === -1) {
      lane = laneEndColumn.length
      laneEndColumn.push(-1)
    }
    segment.lane = lane
    laneEndColumn[lane] = segment.colStart + segment.colSpan - 1
  }

  return segments
}

export function computeLaneHeightsByColumn(segments: EventSegment[], baseOffset = 0): number[] {
  const heights = Array.from({ length: 7 }, () => 0)

  for (const segment of segments) {
    const laneHeight = baseOffset + (segment.lane + 1) * CALENDAR_EVENT_LANE_HEIGHT
    const endColumn = segment.colStart + segment.colSpan
    for (let column = segment.colStart; column < endColumn; column += 1) {
      if (laneHeight > heights[column]) heights[column] = laneHeight
    }
  }

  return heights
}

export function computeReservedLaneHeightsByColumn(
  segments: DisplaySegment[],
  holidayCountsByColumn: number[]
): number[] {
  const heights = Array.from({ length: 7 }, () => 0)

  for (const segment of segments) {
    const segmentBottom = segment.holidayOffset + (segment.lane + 1) * CALENDAR_EVENT_LANE_HEIGHT
    const endColumn = segment.colStart + segment.colSpan
    for (let column = segment.colStart; column < endColumn; column += 1) {
      const reservedHeight = Math.max(
        0,
        segmentBottom - getHolidayBlockHeight(holidayCountsByColumn[column] ?? 0)
      )
      if (reservedHeight > heights[column]) heights[column] = reservedHeight
    }
  }

  return heights
}

export function buildCalendarGrid(year: number, month: number): CalendarDayCell[] {
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  const rows = Math.ceil((startDow + daysInMonth) / 7)
  const totalCells = rows * 7
  const cells: CalendarDayCell[] = []

  for (let i = startDow - 1; i >= 0; i -= 1) {
    cells.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), isCurrentMonth: true })
  }
  const trailingDays = totalCells - cells.length
  for (let day = 1; day <= trailingDays; day += 1) {
    cells.push({ date: new Date(year, month + 1, day), isCurrentMonth: false })
  }

  return cells
}

export function getCalendarGridRange(year: number, month: number) {
  const cells = buildCalendarGrid(year, month)
  const start = cells[0].date
  const last = cells[cells.length - 1].date
  const endExclusive = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)

  return { start, endExclusive }
}
