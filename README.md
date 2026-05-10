<h1><img src="public/logo.webp" alt="Koko logo" width="40" /> Koko — Family Hub</h1>

[한국어](README.ko.md) | [日本語](README.ja.md) | **[English]**

Koko is a family collaboration PWA built around one shared app shell.
The current product surface is calendar, recurring events, reminder lists, family invite/join, user preferences, and Web Push notifications.

## Current Scope

- Google OAuth login gated by an email allowlist
- Explicit family creation and invite-code based family join
- Calendar with family-wide events, calendar-specific visibility, recurring events, and event label colors
- Event reminders and daily digests delivered through Web Push
- Reminder lists with realtime sync and drag-and-drop ordering
- User preferences for theme, holiday countries, and lunar date display
- Installable PWA experience on mobile and desktop

Not implemented in the current UI:

- Memos
- Event voting

Those tables exist in the schema and generated types, but not in the active frontend flow.

## Runtime Shape

The app uses a single mounted family shell:

- `/calendar` is the only live tab entry route
- `/reminders` and `/settings` redirect back to the `/calendar` tab shell
- `TabsShell` keeps calendar, reminders, and settings mounted, then toggles visibility with a keep-alive pattern

This structure avoids tab reload spinners and preserves state while switching between tabs.

## Realtime Model

Koko uses Supabase Realtime Broadcast, not `postgres_changes`.

The pattern is:

1. Perform a mutation.
2. Refresh local state as needed.
3. Send a manual `refresh` broadcast after the channel reaches `SUBSCRIBED`.

This is used for:

- Family-scoped reminder list refresh
- Reminder-item refresh inside a specific list
- Family-scoped calendar event refresh with month-window refetching

## Auth And Family Model

- Login is Google OAuth only.
- Supabase performs the OAuth code exchange automatically.
- The callback page validates the signed-in email against `allowed_emails`.
- A valid invite code can auto-allow a first-time email during callback validation.
- `/api/family/me` calls a DB RPC to read the current family and app role.
- `/api/family/create` calls a DB RPC to explicitly create a family during onboarding.
- `/api/family/join` calls a DB RPC to move the user into another family by invite code.

The active family is the tenant boundary for calendars, reminder lists, and family membership data.

## Tech Stack

| Category | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Backend / DB | Supabase Auth, PostgreSQL, Realtime Broadcast |
| Notifications | Web Push + service worker |
| Hosting | Vercel |
| Testing | Jest + Testing Library |

## Project Structure

```text
src/
  app/                Route entry points and API routes
  components/         UI composition and tab containers
  hooks/              Shared client hooks
  lib/                Supabase CRUD, API helpers, utilities
  types/              Generated database and shared app types
  __tests__/          API, lib, hook, component, and feature regression tests
public/
  manifest.json       PWA manifest
  sw.js               Service worker for push notifications
supabase/
  migrations/         Schema, RLS, RPCs, operational fixes
```

Start with these repo docs when changing the project:

1. `AGENTS.md`
2. `docs/PROJECT_MAP.md`
3. `docs/PATTERNS.md`
4. `docs/CHALLENGES.md`

## Key Directories

- [`src/components/TabsShell.tsx`](/Users/codingclef/workspace_codex/koko/src/components/TabsShell.tsx): keep-alive app shell
- [`src/components/tabs/CalendarTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/CalendarTab.tsx): calendar runtime container
- [`src/components/tabs/ReminderTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/ReminderTab.tsx): reminder overview container
- [`src/components/tabs/SettingsTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/SettingsTab.tsx): settings and family actions
- [`src/hooks/useRealtimeSync.ts`](/Users/codingclef/workspace_codex/koko/src/hooks/useRealtimeSync.ts): shared broadcast subscription pattern
- [`src/app/api/family/me/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/me/route.ts): current family and app role lookup
- [`src/app/api/family/create/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/create/route.ts): explicit family creation
- [`src/app/api/family/join/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/join/route.ts): invite-based family join
- [`src/app/api/cron/send-reminders/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/send-reminders/route.ts): scheduled reminder delivery
- [`src/app/api/cron/daily-digest/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/daily-digest/route.ts): daily schedule digest delivery
- [`src/app/api/cron/cleanup-reminders/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/cleanup-reminders/route.ts): sent reminder cleanup

## Environment Variables

Create `.env.local` with at least:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
KASI_HOLIDAY_API_KEY=
KASI_HOLIDAY_API_KEY_EXPIRES_AT=
```

What they are used for:

- `NEXT_PUBLIC_SUPABASE_URL`: shared Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser client auth and normal data access
- `SUPABASE_SERVICE_ROLE_KEY`: server-side admin client for RPCs and protected tables
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: browser push subscription registration
- `VAPID_PRIVATE_KEY`: server-side push sending
- `CRON_SECRET`: protects cron endpoints
- `KASI_HOLIDAY_API_KEY`: Korean public holiday API key for holiday overlays
- `KASI_HOLIDAY_API_KEY_EXPIRES_AT`: optional `YYYY-MM-DD` expiry date used to warn before the KASI key expires

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Recommended daily commands:

```bash
npm run lint
npm run test
npx tsc --noEmit
```

## Testing

The repo already includes regression coverage for:

- API routes
- Supabase-facing `lib/*` modules
- Shared hooks
- Calendar, reminders, settings, and shell UI behavior

When changing code, update the relevant tests and run `npx tsc --noEmit` before considering the work complete.

## Database Notes

Schema and RLS live in `supabase/migrations`.

Important current tables:

- `families`
- `family_members`
- `allowed_emails`
- `app_invites`
- `user_preferences`
- `calendars`
- `calendar_members`
- `events`
- `event_reminders`
- `recurrence_rules`
- `recurrence_series`
- `shopping_lists`
- `shopping_items`
- These two tables are legacy physical DB names for the reminders domain
- `push_subscriptions`
- `daily_digest_log`

Important current RPC and migration-driven behavior:

- Explicit family creation and legacy atomic family bootstrap
- Atomic family join by invite code
- Reminder selection and sent-at marking
- Sent reminder cleanup
- Recurring event series creation, update, and deletion
- RLS fixes for family, reminders, and calendar membership flows

## Documentation Notes

`docs/PATTERNS.md` captures the implementation rules that should be preserved.
`docs/CHALLENGES.md` records the bugs and regressions that produced those rules.
