import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260508000000_reminder_groups_groundwork.sql'
)
const ownerAccessMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260509000000_fix_reminder_group_owner_access.sql'
)

const sql = () => fs.readFileSync(migrationPath, 'utf8')
const ownerAccessSql = () => fs.readFileSync(ownerAccessMigrationPath, 'utf8')

describe('reminder groups migration', () => {
  it('does not expose grouped lists by clearing reminder_group_id on group delete', () => {
    const migration = sql()

    expect(migration).toContain('references reminder_groups (id, family_id)')
    expect(migration).toContain('on delete restrict')
    expect(migration).not.toContain('on delete set null (reminder_group_id)')
  })

  it('blocks direct list scope changes after creation', () => {
    const migration = sql()

    expect(migration).toContain('create or replace function prevent_reminder_list_scope_change()')
    expect(migration).toContain('reminder_list_scope_change_not_allowed')
    expect(migration).toContain('before update of family_id, reminder_group_id on shopping_lists')
  })

  it('keeps grouped list access behind reminder group membership helpers', () => {
    const migration = sql()

    expect(migration).toContain('create or replace function get_my_reminder_group_ids()')
    expect(migration).toContain('create or replace function get_my_list_ids()')
    expect(migration).toContain('sl.reminder_group_id in (select get_my_reminder_group_ids())')
  })

  it('backfills group owners and includes created groups in access helpers', () => {
    const migration = ownerAccessSql()

    expect(migration).toContain('insert into reminder_group_members')
    expect(migration).toContain('from reminder_groups rg')
    expect(migration).toContain('on conflict (reminder_group_id, user_id) do update')
    expect(migration).toContain('select id')
    expect(migration).toContain('from reminder_groups')
    expect(migration).toContain('where created_by = auth.uid()')
  })
})
