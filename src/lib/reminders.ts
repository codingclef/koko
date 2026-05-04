export const REMINDER_TIME_ZONE = 'Asia/Tokyo'
export const FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR = 8
export const FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES = 1440
export const REMINDER_CRON_PERIOD_MINUTES = 5
export const REMINDER_CRON_LOOKBACK_MINUTES = 6
export const REMINDER_CRON_FORWARD_BUFFER_SECONDS = 5

export function usesFixedMorningAllDayReminder(isAllDay: boolean, remindMinutesBefore: number): boolean {
  return (
    isAllDay &&
    remindMinutesBefore >= FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES &&
    remindMinutesBefore % 1440 === 0
  )
}

function getTokyoDateParts(value: string | Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REMINDER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date(value))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to derive Tokyo-local date parts for reminder trigger')
  }

  return { year, month, day }
}

export function getReminderTriggerAt(
  eventStart: string | Date,
  isAllDay: boolean,
  remindMinutesBefore: number
): string {
  const start = new Date(eventStart)

  if (!usesFixedMorningAllDayReminder(isAllDay, remindMinutesBefore)) {
    return new Date(start.getTime() - remindMinutesBefore * 60 * 1000).toISOString()
  }

  const { year, month, day } = getTokyoDateParts(start)
  const daysBefore = remindMinutesBefore / 1440
  const tokyoMidnight = new Date(`${year}-${month}-${day}T00:00:00+09:00`)

  return new Date(
    tokyoMidnight.getTime() -
    daysBefore * 24 * 60 * 60 * 1000 +
    FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR * 60 * 60 * 1000
  ).toISOString()
}

export function getReminderSelectionWindow(runAt: string | Date): {
  start: Date
  end: Date
} {
  const runTime = new Date(runAt)

  return {
    start: new Date(runTime.getTime() - REMINDER_CRON_LOOKBACK_MINUTES * 60 * 1000),
    end: new Date(runTime.getTime() + REMINDER_CRON_FORWARD_BUFFER_SECONDS * 1000),
  }
}

export function isReminderDueForRun(reminderTriggerAt: string | Date, runAt: string | Date): boolean {
  const triggerTime = new Date(reminderTriggerAt).getTime()
  const { start, end } = getReminderSelectionWindow(runAt)

  return triggerTime >= start.getTime() && triggerTime <= end.getTime()
}
