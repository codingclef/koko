import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260514000000_backfill_data_api_grants.sql'
)

const sql = () => fs.readFileSync(migrationPath, 'utf8')

describe('supabase data api grants migration', () => {
  it('backfills authenticated grants for direct client tables', () => {
    const migration = sql()

    expect(migration).toContain("to_regclass('public.user_preferences')")
    expect(migration).toContain('grant select, insert, update on public.user_preferences to authenticated')
    expect(migration).toContain('grant select, update, delete on public.shopping_items to authenticated')
    expect(migration).toContain('grant select, insert, update, delete on public.calendars to authenticated')
    expect(migration).toContain('grant select on public.recurrence_rules to authenticated')
  })

  it('keeps service-only tables off authenticated and grants them to service_role', () => {
    const migration = sql()

    expect(migration).toContain("to_regclass('public.allowed_emails')")
    expect(migration).toContain('grant select, insert, update, delete on public.allowed_emails to service_role')
    expect(migration).toContain('grant select, insert, update, delete on public.app_invites to service_role')
    expect(migration).toContain('grant select, insert, update, delete on public.daily_digest_log to service_role')
    expect(migration).not.toContain('grant select, insert, update, delete on public.allowed_emails to authenticated')
  })

  it('uses table existence guards so bootstrap does not fail on absent legacy tables', () => {
    const migration = sql()

    expect(migration).toContain("if to_regclass('public.calendars') is not null then")
    expect(migration).toContain("if to_regclass('public.push_subscriptions') is not null then")
    expect(migration).toContain("if to_regclass('public.daily_digest_log') is not null then")
  })
})
