import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260820000000_convert_event_to_recurring_series.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')

describe('convert_event_to_recurring_series_authorized migration', () => {
  it('기존 event를 잠그고 이미 반복 전환된 요청을 거부한다', () => {
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain("RAISE EXCEPTION 'already_recurring'")
  })

  it('기존 event id를 유지한 채 첫 occurrence로 연결한다', () => {
    expect(sql).toContain('WHERE id = p_event_id')
    expect(sql).toContain('series_id = v_series_id')
    expect(sql).toContain('series_occurrence_date = p_local_start_date')
    expect(sql).not.toContain('DELETE FROM events')
  })

  it('같은 transaction에서 rule, series, reminder, occurrence를 생성한다', () => {
    expect(sql).toContain('INSERT INTO recurrence_rules')
    expect(sql).toContain('INSERT INTO recurrence_series')
    expect(sql).toContain('DELETE FROM event_reminders WHERE event_id = p_event_id')
    expect(sql).toContain('PERFORM insert_series_event_instance')
  })

  it('과거·여러 날·시작 요일 불일치 전환을 방어한다', () => {
    expect(sql).toContain("RAISE EXCEPTION 'past_event'")
    expect(sql).toContain("RAISE EXCEPTION 'multi_day_event'")
    expect(sql).toContain("RAISE EXCEPTION 'invalid_local_date'")
    expect(sql).toContain("AT TIME ZONE 'Asia/Tokyo'")
    expect(sql).toContain("RAISE EXCEPTION 'start_day_not_selected'")
  })

  it('클라이언트 실행 권한을 닫고 service role만 허용한다', () => {
    expect(sql).toContain('FROM public, anon, authenticated')
    expect(sql).toContain('TO service_role')
  })
})
