export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurrenceRule {
  freq: RecurrenceFreq
  interval: number
  daysOfWeek?: number[]   // 0=Sun … 6=Sat, weekly only
  dayOfMonth?: number     // 1-31, monthly only
  endDate?: string        // YYYY-MM-DD
}

export type RecurrenceScope = 'single' | 'following' | 'all'
export const VALID_SCOPES: RecurrenceScope[] = ['single', 'following', 'all']

const FREQ_LABEL: Record<RecurrenceFreq, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
}

export const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

export function getRecurrenceIntervalUnit(freq: RecurrenceFreq): string {
  switch (freq) {
    case 'daily':
      return '일'
    case 'weekly':
      return '주'
    case 'monthly':
      return '개월'
    case 'yearly':
      return '년'
  }
}

export function buildRecurrenceLabel(rule: RecurrenceRule): string {
  const freq = FREQ_LABEL[rule.freq]
  const interval = rule.interval > 1 ? `${rule.interval}` : ''

  if (rule.freq === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const days = [...rule.daysOfWeek].sort().map((d) => DOW_KR[d]).join(', ')
    return interval ? `${interval}주마다 ${days}요일` : `매주 ${days}요일`
  }
  if (rule.freq === 'monthly' && rule.dayOfMonth) {
    return interval ? `${interval}개월마다 ${rule.dayOfMonth}일` : `매월 ${rule.dayOfMonth}일`
  }
  if (interval) {
    return `${interval}${getRecurrenceIntervalUnit(rule.freq)}마다`
  }
  return freq
}
