-- Keep pg_cron execution logs bounded so routine jobs do not grow
-- cron.job_run_details indefinitely.

create schema if not exists maintenance;

create or replace function maintenance.cleanup_cron_job_run_details(
  p_retention_days integer default 14
)
returns integer
security definer
set search_path = pg_catalog, cron, pg_temp
language plpgsql
as $$
declare
  v_deleted_count integer;
begin
  if p_retention_days < 0 then
    raise exception 'invalid_retention_days';
  end if;

  with deleted_rows as (
    delete from cron.job_run_details
    -- Preserve rows without end_time so in-flight or abnormal runs are not deleted blindly.
    where end_time < now() - make_interval(days => p_retention_days)
    returning 1
  )
  select count(*)::integer into v_deleted_count
  from deleted_rows;

  return v_deleted_count;
end;
$$;

revoke execute on function maintenance.cleanup_cron_job_run_details(integer)
from public, anon, authenticated;

do $do$
declare
  cleanup_job_id bigint;
begin
  select jobid
  into cleanup_job_id
  from cron.job
  where jobname = 'cleanup-cron-job-run-details'
  limit 1;

  if cleanup_job_id is not null then
    perform cron.unschedule(cleanup_job_id);
  end if;

  perform cron.schedule(
    'cleanup-cron-job-run-details',
    '23 3 * * *',
    $$select maintenance.cleanup_cron_job_run_details(14);$$
  );
end;
$do$;
