import {
  FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR,
  FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES,
  getReminderTriggerAt,
  usesFixedMorningAllDayReminder,
} from '@/lib/reminders'

describe('usesFixedMorningAllDayReminder', () => {
  it('종일 일정의 하루 단위 advance reminder는 고정 오전 알람을 사용한다', () => {
    expect(usesFixedMorningAllDayReminder(true, 1440)).toBe(true)
    expect(usesFixedMorningAllDayReminder(true, 2880)).toBe(true)
    expect(usesFixedMorningAllDayReminder(true, 10080)).toBe(true)
    expect(usesFixedMorningAllDayReminder(true, 60)).toBe(false)
    expect(usesFixedMorningAllDayReminder(true, 1500)).toBe(false)
    expect(usesFixedMorningAllDayReminder(false, 1440)).toBe(false)
  })

  it('고정 오전 알람 시각은 오전 8시다', () => {
    expect(FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR).toBe(8)
    expect(FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES).toBe(1440)
  })
})

describe('getReminderTriggerAt', () => {
  it('시간 지정 일정은 기존처럼 시작 시각 기준으로 분 단위 차감한다', () => {
    expect(getReminderTriggerAt('2026-04-25T09:30:00+09:00', false, 1440))
      .toBe('2026-04-24T00:30:00.000Z')
  })

  it('종일 일정의 1일 전은 Tokyo 기준 전날 오전 8시에 발송된다', () => {
    expect(getReminderTriggerAt('2026-04-25T00:00:00+09:00', true, 1440))
      .toBe('2026-04-23T23:00:00.000Z')
  })

  it('종일 일정의 2일 전은 Tokyo 기준 이틀 전 오전 8시에 발송된다', () => {
    expect(getReminderTriggerAt('2026-04-25T00:00:00+09:00', true, 2880))
      .toBe('2026-04-22T23:00:00.000Z')
  })

  it('종일 일정의 1주 전도 Tokyo 기준 7일 전 오전 8시에 발송된다', () => {
    expect(getReminderTriggerAt('2026-04-25T00:00:00+09:00', true, 10080))
      .toBe('2026-04-17T23:00:00.000Z')
  })
})
