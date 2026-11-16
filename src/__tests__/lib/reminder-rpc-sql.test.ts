import {
  FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR,
  FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES,
  REMINDER_CRON_FORWARD_BUFFER_SECONDS,
  REMINDER_TIME_ZONE,
} from '@/lib/reminders'
import { readLatestMigrationMatching } from '@/test-utils/migrations'

const sql = readLatestMigrationMatching(/create or replace function public\.claim_due_reminders\(\)/i).toLowerCase()
const dueFunction = sql.slice(
  sql.indexOf('create function public.event_reminder_due_at('),
  sql.indexOf('create function public.is_event_reminder_choice(')
)
const claimFunction = sql.slice(
  sql.search(/create or replace function public\.claim_due_reminders\(\)/i),
  sql.search(/create or replace function public\.acknowledge_reminders\(/i)
)
const acknowledgeFunction = sql.slice(sql.search(/create or replace function public\.acknowledge_reminders\(/i))

describe('due reminder claim and acknowledgement migration', () => {
  it('종일 일정의 하루 단위 advance reminder를 오전 8시 고정 시각으로 계산한다', () => {
    expect(dueFunction).toContain(`when p_all_day and p_offset >= ${FIXED_ALL_DAY_ADVANCE_REMINDER_MINIMUM_MINUTES}`)
    expect(dueFunction).toContain('and mod(p_offset, 1440) = 0')
    expect(dueFunction).toContain(`(p_start at time zone '${REMINDER_TIME_ZONE.toLowerCase()}')::date`)
    expect(dueFunction).toContain(`+ time '${String(FIXED_ALL_DAY_ADVANCE_REMINDER_HOUR).padStart(2, '0')}:00'`)
    expect(claimFunction).toContain('event_reminder_due_at(e.start_at, e.is_all_day, er.remind_minutes_before)')
  })

  it('발송 전에는 claim만 기록하고 임대 만료 후 한 시간 안에서 재시도한다', () => {
    expect(claimFunction).toContain('set claimed_at = now()')
    expect(claimFunction).not.toContain('set sent_at = now()')
    expect(claimFunction).toContain("claimed_at < now() - interval '10 minutes'")
    expect(claimFunction).toContain(
      `between now() - interval '1 hour' and now() + interval '${REMINDER_CRON_FORWARD_BUFFER_SECONDS} seconds'`
    )
  })

  it('ack 시에만 sent_at을 기록하고 claim을 해제한다', () => {
    expect(acknowledgeFunction).toContain('set sent_at = now(), claimed_at = null, claim_token = null')
    expect(acknowledgeFunction).toContain('else claim_token = any(p_claim_tokens)')
    expect(acknowledgeFunction).toContain('to service_role')
  })
})
