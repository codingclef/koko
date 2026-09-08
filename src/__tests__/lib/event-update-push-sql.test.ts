import { readLatestMigrationMatching } from '@/test-utils/migrations'

const sql = readLatestMigrationMatching(/create or replace function update_event_authorized\(/i)

describe('event update push-change migration', () => {
  it('단일 일정 변경 판정에서 labelColor와 reminderMinutes를 제외한다', () => {
    const singleFunction = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION update_event_authorized'),
      sql.indexOf('CREATE OR REPLACE FUNCTION update_series_authorized')
    )

    expect(singleFunction).toContain('v_is_changed := (')
    expect(singleFunction).not.toContain('p_has_label_color AND')
    expect(singleFunction).not.toContain('p_reminder_minutes IS NOT NULL AND')
    expect(singleFunction).toContain('label_color = CASE WHEN p_has_label_color THEN p_label_color ELSE label_color END')
  })

  it('반복 일정 변경 판정에서 labelColor와 reminderMinutes를 제외한다', () => {
    const seriesFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION update_series_authorized'))

    expect(seriesFunction).toContain('v_is_changed boolean')
    expect(seriesFunction).toContain('v_new_start_at timestamptz')
    expect(seriesFunction).toContain("'is_changed',      v_is_changed")
    expect(seriesFunction).toContain("'new_start_at',    v_new_start_at")
    expect(seriesFunction).not.toContain("'is_changed',      true")
    expect(seriesFunction).not.toContain('p_has_label_color AND')
    expect(seriesFunction).not.toContain('p_reminder_minutes IS NOT NULL AND')
    expect(seriesFunction).toContain('p_start_at               timestamptz')
    expect(seriesFunction).toContain('p_has_end_at             boolean')
  })

  it('following/all 반복 일정은 대상 occurrence 전체에서 실제 변경 여부를 계산한다', () => {
    const seriesFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION update_series_authorized'))

    expect(seriesFunction).toContain('WITH candidate_events AS (')
    expect(seriesFunction).toContain('changed_events AS (')
    expect(seriesFunction).toContain('FROM events ev')
    expect(seriesFunction).toContain('ev.series_id = v_event.series_id')
    expect(seriesFunction).toContain('OR ev.series_occurrence_date >= p_anchor_occurrence_date')
    expect(seriesFunction).toContain('EXISTS(SELECT 1 FROM changed_events)')
    expect(seriesFunction).toContain('INTO v_is_changed, v_new_start_at')
  })

  it('following/all 반복 일정의 push startAt은 실제 변경되는 첫 occurrence의 변경 후 시작 시각으로 반환한다', () => {
    const seriesFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION update_series_authorized'))

    expect(seriesFunction).toContain('SELECT next_start_at')
    expect(seriesFunction).toContain('FROM changed_events')
    expect(seriesFunction).toContain('ORDER BY series_occurrence_date ASC, start_at ASC')
    expect(seriesFunction).toContain('LIMIT 1')
    expect(seriesFunction).toContain("'new_start_at',    v_new_start_at")
  })
})
