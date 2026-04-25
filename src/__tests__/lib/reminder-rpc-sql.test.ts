import fs from 'node:fs'
import path from 'node:path'
import {
  FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR,
  FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES,
  REMINDER_TIME_ZONE,
} from '@/lib/reminders'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260425030000_fix_all_day_advance_reminder_time.sql'
)

describe('get_and_mark_due_reminders migration', () => {
  it('종일 일정의 하루 단위 advance reminder를 오전 8시 고정 시각으로 계산한다', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create function public.get_and_mark_due_reminders()')
    expect(sql).toContain('when e.is_all_day')
    expect(sql).toContain(`and er.remind_minutes_before >= ${FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES}`)
    expect(sql).toContain('and mod(er.remind_minutes_before, 1440) = 0')
    expect(sql).toContain(`timezone('${REMINDER_TIME_ZONE}', e.start_at)::date`)
    expect(sql).toContain(`+ time '${String(FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR).padStart(2, '0')}:00'`)
    expect(sql).toContain(`) at time zone '${REMINDER_TIME_ZONE}'`)
  })

  it('시간 지정 일정과 하루 단위가 아닌 reminder는 기존 분 단위 차감 로직을 유지한다', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("else\n            e.start_at - (er.remind_minutes_before * interval '1 minute')")
    expect(sql).toContain("between now() - interval '65 seconds' and now() + interval '5 seconds'")
  })
})
