export interface CalendarDayCell {
  date: Date
  isCurrentMonth: boolean
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
