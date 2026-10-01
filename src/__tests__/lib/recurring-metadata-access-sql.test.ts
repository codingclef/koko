import { readLatestMigrationMatching } from '@/test-utils/migrations'

const sql = readLatestMigrationMatching(/alter policy select_recurrence_series/i)

describe('recurring metadata access migration', () => {
  it('일반 일정과 동일하게 가족 전체 또는 캘린더 멤버만 읽을 수 있다', () => {
    expect(sql).toContain('calendar_id is null and family_id in (select public.get_my_family_ids())')
    expect(sql).toContain('calendar_id in (select public.get_my_calendar_ids())')
  })

  it('반복 규칙은 접근 가능한 부모 시리즈를 통해서만 읽는다', () => {
    expect(sql).toContain('select 1 from public.recurrence_series rs')
    expect(sql).toContain('where rs.rule_id = recurrence_rules.id')
  })

  it('익명 접근과 직접 쓰기를 차단하고 서버 쓰기 권한을 유지한다', () => {
    expect(sql).toContain('revoke all on public.recurrence_series, public.recurrence_rules from anon, authenticated')
    expect(sql).toContain('grant select on public.recurrence_series, public.recurrence_rules to authenticated')
    expect(sql).toContain('grant select, insert, update, delete on public.recurrence_series, public.recurrence_rules to service_role')
    expect(sql).not.toMatch(/\b(insert into|update|delete from) public\./i)
  })
})
