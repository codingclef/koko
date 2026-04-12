# PROJECT_MAP.md

# Koko Project Map

This document is a fast orientation guide for understanding the current codebase.
It summarizes implemented features, file ownership, data relationships, and the main runtime flows.

## 1. Product Scope

Koko is a family collaboration PWA centered on one shared app shell.

### Implemented

- Family login with Google OAuth and email allowlist
- Automatic family creation and family join by invite code
- Calendar with family-scoped and calendar-scoped visibility
- Shopping lists with realtime sync and drag-and-drop sorting
- User preferences: holiday countries, app theme, lunar display
- PWA installation and Web Push reminder delivery

### Present in Schema but Not Implemented in UI

- `memos`
- `event_votes`

These appear in the database schema and generated types, but there is no active frontend or `lib/*` implementation for them.

## 2. App Structure

### Top-Level Runtime Shape

- `src/app/layout.tsx`
  - Global metadata, font loading, SSR-safe theme bootstrapping
- `src/app/page.tsx`
  - Redirects to `/calendar`
- `src/app/calendar/page.tsx`
  - Single mounted app entry point
- `src/components/TabsShell.tsx`
  - Keep-alive shell for calendar, shopping, settings

### Redirect Routes

- `src/app/shopping/page.tsx`
- `src/app/settings/page.tsx`

These redirect to `/calendar` because the real app state is hosted inside `TabsShell`.

## 3. Feature Map

### Auth and Access

- Login page: `src/app/login/page.tsx`
- OAuth callback: `src/app/auth/callback/page.tsx`
- Allowlist check API: `src/app/api/auth/check-allowed/route.ts`
- Invite code parsing: `src/lib/auth.ts`

Flow:
- User signs in with Google
- Supabase auto-creates the session
- Callback checks `allowed_emails`
- A valid invite code can auto-allow a first-time user
- Unauthorized users are signed out and redirected to login

### Family

- Family bootstrap API: `src/app/api/family/route.ts`
- Family join API: `src/app/api/family/join/route.ts`
- Join page: `src/app/join/page.tsx`
- Family helpers: `src/lib/family.ts`
- Family hook: `src/hooks/useFamily.ts`

Flow:
- After auth, the app resolves the user's family via `get_or_create_family`
- Users can move into another family by invite code
- The active family is the tenant boundary for most data

### Calendar

- Tab container: `src/components/tabs/CalendarTab.tsx`
- Data layer: `src/lib/calendar.ts`
- Calendar hook: `src/hooks/useCalendars.ts`
- Holiday hook: `src/hooks/useHolidays.ts`
- Swipe hook: `src/hooks/useSwipe.ts`
- UI:
  - `src/components/calendar/CalendarGrid.tsx`
  - `src/components/calendar/CalendarFilter.tsx`
  - `src/components/calendar/CalendarListSheet.tsx`
  - `src/components/calendar/DayEventsSheet.tsx`
  - `src/components/calendar/EventDetailSheet.tsx`
  - `src/components/calendar/EventFormModal.tsx`
  - `src/components/calendar/CalendarFormModal.tsx`
  - `src/components/calendar/TimeWheelPicker.tsx`

Current behavior:
- Month-based event loading
- Calendar filter chips
- Family-wide events and calendar-specific events
- Calendar membership management
- Reminder settings per event
- Holiday overlays and optional lunar date display

### Shopping

- Tab container: `src/components/tabs/ShoppingTab.tsx`
- Detail page: `src/app/shopping/[id]/page.tsx`
- Data layer: `src/lib/shopping.ts`
- UI:
  - `src/components/shopping/ShoppingListCard.tsx`
  - `src/components/shopping/CreateListModal.tsx`
  - `src/components/shopping/ShoppingItem.tsx`
  - `src/components/shopping/AddItemInput.tsx`

Current behavior:
- Shopping list creation, rename, delete
- Two list types: `strikethrough` and `delete`
- Item add/check/delete/rename
- Drag-and-drop list and item ordering
- Optimistic UI for create operations

### Settings and Preferences

- Tab container: `src/components/tabs/SettingsTab.tsx`
- Preferences helpers: `src/lib/preferences.ts`
- Preferences hook: `src/hooks/useUserPreferences.ts`

Current behavior:
- View account email
- Edit display name
- Share family invite code
- Join a family by code
- Enable push notifications
- Configure holiday countries
- Toggle lunar display
- Change app theme

### Realtime and Push

- Realtime hook: `src/hooks/useRealtimeSync.ts`
- Push registration: `src/lib/push.ts`
- Web Push sender: `src/lib/webpush.ts`
- Push subscription API: `src/app/api/push/subscribe/route.ts`
- Push test API: `src/app/api/push/test/route.ts`
- Reminder cron API: `src/app/api/cron/send-reminders/route.ts`
- Service worker: `public/sw.js`
- PWA manifest: `public/manifest.json`

## 4. File Responsibility Map

### `src/app/*`

- Route entry points, redirects, and server APIs
- Minimal orchestration only

### `src/components/*`

- UI composition and local interaction state
- Tab-level containers own feature-level fetch and realtime subscription wiring

### `src/lib/*`

- Supabase clients
- Typed CRUD and feature utilities
- No view logic

### `src/hooks/*`

- Shared stateful client hooks
- Reusable auth, family, preferences, holidays, swipe, realtime logic

### `src/types/*`

- Generated database contract and shared UI types

### `supabase/migrations/*`

- Source of truth for database schema, RLS, helper functions, and operational fixes

### `src/__tests__/*`

- Regression coverage across API routes, hooks, lib functions, and major UI pieces

## 5. Data Model Summary

### Core Entities

- `families`
  - Top-level tenant for shared family data
- `family_members`
  - Membership records for users inside a family
- `allowed_emails`
  - Login allowlist for authorized users
- `user_preferences`
  - Per-user UI and calendar display preferences

### Calendar Domain

- `calendars`
  - Named calendars belonging to a family
- `calendar_members`
  - Per-calendar access control
- `events`
  - Calendar events, optionally assigned to a specific calendar
- `event_reminders`
  - Reminder offsets attached to events
- `event_votes`
  - Exists in schema only at the moment

### Shopping Domain

- `shopping_lists`
  - Family-owned lists
- `shopping_items`
  - Items inside a shopping list

### Other Domain Tables

- `memos`
  - Exists in schema only at the moment
- `push_subscriptions`
  - Web Push endpoints per user/device/browser

## 6. ERD-Level Relationship Summary

```text
auth.users
  ├─< family_members >─ families
  ├─< user_preferences
  └─< push_subscriptions

families
  ├─< calendars
  ├─< events
  ├─< shopping_lists
  └─< memos

calendars
  ├─< calendar_members >─ auth.users
  └─< events

events
  ├─< event_reminders
  └─< event_votes >─ auth.users

shopping_lists
  └─< shopping_items
```

Important notes:
- A user is effectively modeled as belonging to one active family through `family_members.user_id` uniqueness.
- `events.calendar_id` can be `null`, which means a family-wide event not restricted to a specific calendar.
- `calendar_members` is the access-control table for calendar visibility.

## 7. Main Runtime Flows

### App Initialization

1. `useAuth()` resolves the current session
2. `useFamily()` calls `/api/family`
3. `TabsShell` mounts all three tabs
4. Each tab loads its own data

### Realtime

1. Tab/page subscribes through `useRealtimeSync`
2. Local mutation updates Supabase
3. The mutation owner manually broadcasts `refresh`
4. Other clients receive the event and reload

### Push Reminders

1. Client requests notification permission
2. Browser push subscription is stored in `push_subscriptions`
3. Scheduled cron hits `/api/cron/send-reminders`
4. Server fetches due reminders and marks them as sent atomically
5. Web Push is sent to active subscriptions

## 8. Rules to Keep in Mind Before Editing

- Read `docs/PATTERNS.md` before feature work.
- Read `docs/CHALLENGES.md` when touching auth, realtime, RLS, shopping optimistic UI, or mobile modal behavior.
- Do not replace the `TabsShell` keep-alive structure with route-per-tab navigation without understanding the tradeoff.
- Do not switch realtime back to `postgres_changes`.
- Do not call `exchangeCodeForSession`.
- Do not use service-role keys on the client.
- Do not add RLS policies with naive nested `family_members` subqueries when helper functions already exist.

## 9. Useful Entry Files for Fast Orientation

- `src/components/TabsShell.tsx`
- `src/components/tabs/CalendarTab.tsx`
- `src/components/tabs/ShoppingTab.tsx`
- `src/components/tabs/SettingsTab.tsx`
- `src/lib/calendar.ts`
- `src/lib/shopping.ts`
- `src/lib/preferences.ts`
- `src/hooks/useRealtimeSync.ts`
- `src/types/database.ts`
- `docs/PATTERNS.md`
- `docs/CHALLENGES.md`
