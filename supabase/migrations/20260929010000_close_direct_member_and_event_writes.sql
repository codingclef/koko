-- Browser clients read these tables, but all writes go through authorized RPCs.
-- Remove direct writes (and other unnecessary table privileges) without changing data.
revoke all on public.calendar_members, public.reminder_group_members,
  public.events, public.event_reminders from public, anon, authenticated;

grant select on public.calendar_members, public.reminder_group_members,
  public.events, public.event_reminders to authenticated;
