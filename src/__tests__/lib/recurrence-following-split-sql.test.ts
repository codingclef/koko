import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260505001000_split_recurring_series_following.sql'
)

describe('split_recurring_series_following_authorized migration', () => {
  const sql = () => fs.readFileSync(migrationPath, 'utf8')

  it('기존 series를 anchor 전날까지 trim하고 future events를 취소한다', () => {
    const migration = sql()

    expect(migration).toContain('CREATE OR REPLACE FUNCTION split_recurring_series_following_authorized')
    expect(migration.indexOf('IF v_count = 0 THEN')).toBeGreaterThan(-1)
    expect(migration.indexOf('UPDATE events SET is_cancelled = true')).toBeGreaterThan(
      migration.indexOf('IF v_count = 0 THEN')
    )
    expect(migration).toContain('UPDATE events SET is_cancelled = true')
    expect(migration).toContain('series_occurrence_date >= p_anchor_occurrence_date')
    expect(migration).toContain('SET end_date = p_anchor_occurrence_date - 1')
  })

  it('새 rule과 새 series를 만들고 변경된 rule로 future events를 materialize한다', () => {
    const migration = sql()

    expect(migration).toContain('INSERT INTO recurrence_rules')
    expect(migration).toContain('INSERT INTO recurrence_series')
    expect(migration).toContain('RETURNING id INTO v_new_series_id')
    expect(migration).toContain('PERFORM insert_series_event_instance')
    expect(migration).toContain("'old_series_id',   v_event.series_id")
  })

  it('weekly 날짜 변경은 새 시작일의 요일을 기본 days_of_week로 사용한다', () => {
    const migration = sql()

    expect(migration).toContain('p_local_start_date        date')
    expect(migration).toContain('v_start_date := p_local_start_date')
    expect(migration).toContain("WHEN v_freq = 'weekly' THEN COALESCE")
    expect(migration).toContain('ARRAY[EXTRACT(DOW FROM v_start_date)::int]')
  })

  it('새 종료일이 시작일보다 빠르면 기존 future를 취소하지 않고 실패한다', () => {
    const migration = sql()

    expect(migration).toContain('IF v_end_date IS NOT NULL AND v_end_date < v_start_date THEN')
    expect(migration).toContain("RAISE EXCEPTION 'no_future_occurrences'")
  })
})
