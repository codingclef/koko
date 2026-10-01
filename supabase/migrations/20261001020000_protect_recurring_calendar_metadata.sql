-- Recurring metadata must have the same visibility as its event occurrences.
alter policy select_recurrence_series on public.recurrence_series
to authenticated
using (
  (calendar_id is null and family_id in (select public.get_my_family_ids()))
  or calendar_id in (select public.get_my_calendar_ids())
);

-- The parent series RLS applies here; do not duplicate its access conditions.
alter policy select_recurrence_rules on public.recurrence_rules
to authenticated
using (
  exists (
    select 1 from public.recurrence_series rs
    where rs.rule_id = recurrence_rules.id
  )
);

-- These tables are client-readable, but all mutations remain server-only.
revoke all on public.recurrence_series, public.recurrence_rules from anon, authenticated;
grant select on public.recurrence_series, public.recurrence_rules to authenticated;
grant select, insert, update, delete on public.recurrence_series, public.recurrence_rules to service_role;
