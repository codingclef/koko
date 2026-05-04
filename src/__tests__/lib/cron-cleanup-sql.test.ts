import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260504001000_cleanup_cron_run_details.sql'
)

describe('cron job run details cleanup migration', () => {
  it('deletes old pg_cron run details with a bounded retention window', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function maintenance.cleanup_cron_job_run_details')
    expect(sql).toContain('set search_path = pg_catalog, cron, pg_temp')
    expect(sql).toContain('p_retention_days integer default 14')
    expect(sql).toContain('delete from cron.job_run_details')
    expect(sql).toContain('Preserve rows without end_time')
    expect(sql).toContain('where end_time < now() - make_interval(days => p_retention_days)')
  })

  it('schedules a single daily cleanup job', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("where jobname = 'cleanup-cron-job-run-details'")
    expect(sql).toContain('cron.unschedule(cleanup_job_id)')
    expect(sql).toContain("cron.schedule(\n    'cleanup-cron-job-run-details',\n    '23 3 * * *'")
  })
})
