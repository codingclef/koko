import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260902000000_user_calendar_preferences.sql'
)
const migration = fs.readFileSync(migrationPath, 'utf8')

describe('user calendar preferences migration', () => {
  it('사용자와 캘린더 복합키 및 cascade를 정의한다', () => {
    expect(migration).toContain('primary key (user_id, calendar_id)')
    expect(migration).toContain('references auth.users(id) on delete cascade')
    expect(migration).toContain('references public.calendars(id) on delete cascade')
  })

  it('본인 설정만 관리하는 RLS와 Data API grant를 정의한다', () => {
    expect(migration).toContain('using (auth.uid() = user_id)')
    expect(migration).toContain('with check (auth.uid() = user_id)')
    expect(migration).toContain(
      'grant select, insert, update on public.user_calendar_preferences to authenticated'
    )
  })
})
