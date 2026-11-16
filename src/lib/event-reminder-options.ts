// Fixed offsets use minutes. Negative offsets represent calendar months.
export const REMINDER_UNITS = [
  { key: 'minute', label: '분 전', min: 5, max: 55, step: 5, multiplier: 1 },
  { key: 'hour', label: '시간 전', min: 1, max: 23, step: 1, multiplier: 60 },
  { key: 'day', label: '일 전', min: 1, max: 6, step: 1, multiplier: 1440 },
  { key: 'week', label: '주 전', min: 1, max: 4, step: 1, multiplier: 10080 },
  { key: 'month', label: '개월 전', min: 1, max: 12, step: 1, multiplier: -1 },
] as const

export type ReminderUnit = (typeof REMINDER_UNITS)[number]

export function getReminderChoice(offset: number) {
  for (const unit of REMINDER_UNITS) {
    const amount = offset / unit.multiplier
    if (isReminderAmountAllowed(amount, unit)) return { amount, unit }
  }
  return null
}

export function isReminderAmountAllowed(amount: number, unit: ReminderUnit) {
  return amount >= unit.min && amount <= unit.max && amount % unit.step === 0
}

export function isAllowedReminderOffset(offset: number, isAllDay: boolean) {
  const choice = getReminderChoice(offset)
  return choice !== null && (!isAllDay || choice.unit.key !== 'minute' && choice.unit.key !== 'hour')
}

export function formatReminderOffset(offset: number) {
  const choice = getReminderChoice(offset)
  return choice ? `${choice.amount}${choice.unit.label}` : `${offset}분 전`
}

export function isReminderOffsetList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((offset) =>
    Number.isInteger(offset) && offset >= -12 && offset !== 0 && offset <= 2147483647
  )
}
