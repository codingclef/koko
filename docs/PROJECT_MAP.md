# PROJECT_MAP.md

# Koko Project Map

이 문서는 현재 코드베이스를 빠르게 파악하기 위한 안내서다.
구현된 기능 범위, 주요 파일 책임, 데이터 관계, 런타임 흐름을 현재 `main` 기준으로 요약한다.

## 1. Product Scope

Koko는 가족 단위로 일정을 공유하고 리마인더와 설정을 함께 관리하는 PWA다.
앱의 실제 진입점은 `/calendar` 하나이며, 내부에서 탭 셸이 살아 있는 상태로 캘린더, 리마인더, 설정을 전환한다.

### Implemented

- Google OAuth 로그인 + 이메일 허용 목록 기반 접근 제어
- 앱 초대 코드와 가족 초대 코드를 분리한 온보딩/합류 흐름
- 가족 생성, 가족 이름 수정, 가족 초대 코드 공유, 다른 가족으로 합류
- 가족 단위/캘린더 단위 가시성을 모두 지원하는 캘린더
- 일정 생성, 수정, 삭제 API route와 reminder 원자 저장 RPC
- 일정 변경 시 가족/캘린더 멤버 대상 push notification 전송
- 리마인더 목록/아이템 관리, 실시간 동기화, 드래그 정렬
- 사용자 설정: holiday countries, app theme, lunar display
- PWA 설치, service worker, reminder cron 기반 Web Push
- OAuth 심사 대응용 privacy / terms 페이지

### Present In Schema But Not Implemented In UI

- `memos`
- `event_votes`

이 두 테이블은 스키마와 generated types에는 존재하지만 현재 `src/lib/*`, `src/app/*`, `src/components/*`에서 활성 기능으로 연결되어 있지 않다.

## 2. App Structure

### Top-Level Runtime Shape

- `src/app/layout.tsx`
  - 글로벌 메타데이터, 폰트, SSR-safe theme bootstrap
- `src/app/page.tsx`
  - `/calendar`로 리다이렉트
- `src/app/calendar/page.tsx`
  - 가족 앱의 단일 live entry point
- `src/components/TabsShell.tsx`
  - auth/family/preferences/calendars 초기화 후 탭을 keep-alive 상태로 렌더링

### Auxiliary Routes

- `src/app/login/page.tsx`
  - Google OAuth 시작
- `src/app/auth/callback/page.tsx`
  - Supabase 자동 세션 교환 후 allowlist/app invite/family invite 판정
- `src/app/onboarding/page.tsx`
  - allowed user이지만 아직 가족이 없는 사용자의 가족 생성
- `src/app/join/page.tsx`
  - 가족 초대 코드로 기존 가족에 합류
- `src/app/join-app/page.tsx`
  - 앱 초대 링크 진입점. 로그인 후 callback 판정으로 이어짐
- `src/app/reminders/[id]/page.tsx`
  - 리마인더 상세 링크를 `?tab=reminders&list=...` 형태로 브리지
- `src/app/shopping/[id]/page.tsx`
  - 구형 리마인더 상세 링크를 `?tab=reminders&list=...` 형태로 브리지
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`

### Redirect Routes

- `src/app/settings/page.tsx`
- `src/app/reminders/page.tsx`
- `src/app/shopping/page.tsx`

이 두 route는 독립 화면을 렌더링하지 않고 `/calendar` 기반 탭 셸로 리다이렉트한다.

## 3. Feature Map

### Auth And Access

- Login page: `src/app/login/page.tsx`
- OAuth callback: `src/app/auth/callback/page.tsx`
- Allowlist check API: `src/app/api/auth/check-allowed/route.ts`
- Invite parsing helper: `src/lib/auth.ts`
- Auth hook: `src/hooks/useAuth.ts`

Flow:
- 사용자는 Google OAuth로 로그인한다.
- Supabase가 callback URL에서 세션을 자동 교환한다.
- callback 페이지는 `getSession()` + `onAuthStateChange()`로 세션 확보를 기다린다.
- `/api/auth/check-allowed`가 `allowed_emails`, 앱 초대 코드, 가족 초대 코드를 판정한다.
- 앱 초대 코드가 소비되면 `needsOnboarding: true`가 반환되고 `/onboarding`으로 이동한다.
- 허용되지 않은 사용자는 즉시 sign out 후 `/login?error=unauthorized`로 보낸다.

### Family And Onboarding

- Family lookup API: `src/app/api/family/me/route.ts`
- Legacy get-or-create API: `src/app/api/family/route.ts`
- Explicit family create API: `src/app/api/family/create/route.ts`
- Family join API: `src/app/api/family/join/route.ts`
- Family rename API: `src/app/api/family/name/route.ts`
- Family helpers: `src/lib/family.ts`
- Family hook: `src/hooks/useFamily.ts`

Current behavior:
- `useFamily()`는 `/api/family/me`를 호출해 현재 가족과 `appRole`을 읽는다.
- 가족이 없는 allowed user는 `TabsShell`에서 `/onboarding`으로 보낸다.
- `/onboarding`은 `create_family_with_name` RPC로 명시적 가족 생성을 수행한다.
- 가족 합류는 `join_family_by_invite_code` RPC로 원자 처리된다.
- 설정 탭에서 가족 이름을 수정할 수 있다.
- `allowed_emails.app_role`이 `admin`이면 앱 초대 생성 권한을 가진다.

### App Invite Administration

- App invite API: `src/app/api/app-invite/route.ts`
- App invite UI: `src/components/tabs/SettingsTab.tsx`
- Schema support: `app_invites`, `allowed_emails.app_role`

Current behavior:
- 앱 관리자만 새 앱 초대를 생성할 수 있다.
- 앱 초대 링크는 `/join-app?code=...` 형식이다.
- 앱 초대는 1회용이며 만료 시간이 있다.
- 초대 소비는 `consume_app_invite(code, email)` RPC로 원자 처리된다.

### Calendar

- Tab container: `src/components/tabs/CalendarTab.tsx`
- Data layer: `src/lib/calendar.ts`
- Calendar hook: `src/hooks/useCalendars.ts`
- Holiday hook: `src/hooks/useHolidays.ts`
- Swipe hook: `src/hooks/useSwipe.ts`
- Event APIs:
  - `src/app/api/events/route.ts`
  - `src/app/api/events/[id]/route.ts`
- Key UI:
  - `src/components/calendar/CalendarGrid.tsx`
  - `src/components/calendar/CalendarFilter.tsx`
  - `src/components/calendar/CalendarListSheet.tsx`
  - `src/components/calendar/CalendarDetailScreen.tsx`
  - `src/components/calendar/DayEventsSheet.tsx`
  - `src/components/calendar/EventDetailSheet.tsx`
  - `src/components/calendar/EventFormModal.tsx`
  - `src/components/calendar/CalendarFormModal.tsx`
  - `src/components/calendar/TimeWheelPicker.tsx`
  - `src/components/calendar/YearMonthPickerSheet.tsx`

Current behavior:
- 월 단위로 이벤트를 로드하고 인접 월을 prefetch한다.
- 월 이벤트 캐시는 최대 12개월까지 유지된다.
- 가족 전체 일정과 캘린더 전용 일정을 함께 지원한다.
- 캘린더 생성/수정/삭제와 멤버 관리가 가능하다.
- 이벤트 생성/수정은 API route 뒤의 `create_event_with_reminders`, `update_event_with_reminders` RPC로 원자 저장한다.
- 이벤트 삭제는 API route에서 권한 검증 후 수행한다.
- 이벤트 생성/수정/삭제 시 관련 멤버에게 push notification을 보낼 수 있다.
- holiday overlay, lunar display, year-month picker, swipe month navigation을 제공한다.

### Reminders

- Tab container: `src/components/tabs/ReminderTab.tsx`
- Detail view: `src/components/reminders/ReminderDetailView.tsx`
- Bridge route: `src/app/reminders/[id]/page.tsx`
- Legacy bridge route: `src/app/shopping/[id]/page.tsx`
- Data layer: `src/lib/reminder-lists.ts`
- Key UI:
  - `src/components/reminders/ReminderListCard.tsx`
  - `src/components/reminders/CreateReminderListModal.tsx`
  - `src/components/reminders/ReminderItem.tsx`
  - `src/components/reminders/AddItemInput.tsx`

Current behavior:
- 리마인더 목록 생성, 이름 변경, 삭제
- 두 가지 목록 타입: `strikethrough`, `delete`
- 아이템 추가/체크/삭제/이름 변경
- 목록/아이템 drag-and-drop 정렬
- 생성 계열 optimistic UI + 서버 row 치환
- 가족별 module-level cache로 탭 전환과 상세 진입 시 초기 스피너를 최소화
- 상세 상태는 별도 페이지가 아니라 `/calendar?tab=reminders&list=<id>` search param으로 유지한다

### Settings And Preferences

- Tab container: `src/components/tabs/SettingsTab.tsx`
- Preferences helpers: `src/lib/preferences.ts`
- Preferences hook: `src/hooks/useUserPreferences.ts`
- Push registration: `src/lib/push.ts`

Current behavior:
- 계정 이메일 표시
- 내 display name 수정
- 가족 이름 수정
- 가족 초대 코드 공유
- 가족 초대 코드로 다른 가족 합류
- 앱 관리자용 앱 초대 생성/공유
- push notification 권한 요청 및 구독 등록
- holiday countries 변경
- lunar display toggle
- app theme 변경

### Realtime And Push

- Realtime hook: `src/hooks/useRealtimeSync.ts`
- Push notification helpers: `src/lib/push-utils.ts`
- Web Push sender: `src/lib/webpush.ts`
- Push subscription API: `src/app/api/push/subscribe/route.ts`
- Push test API: `src/app/api/push/test/route.ts`
- Reminder cron API: `src/app/api/cron/send-reminders/route.ts`
- Service worker: `public/sw.js`
- Manifest: `public/manifest.json`

Current behavior:
- Supabase Realtime Broadcast를 사용해 가족 범위 변경사항을 동기화한다.
- 이벤트 mutation API는 일정 변경 push를 비동기로 발송한다.
- reminder cron은 `event_reminders`를 기준으로 예정 알림을 발송한다.
- 만료된 push subscription은 발송 실패 시 정리된다.

## 4. File Responsibility Map

### `src/app/*`

- 라우트 진입점, redirect, API route
- 서버 권한 검증과 orchestration

### `src/components/*`

- UI composition과 feature-level interaction state
- 탭 컨테이너가 feature fetch, mutation trigger, realtime wiring을 보유

### `src/lib/*`

- Supabase client
- typed CRUD, API client helper, feature utility
- 서버/클라이언트 공용 비즈니스 접근 함수

### `src/hooks/*`

- 여러 화면에서 재사용하는 client state 로직
- auth, family, preferences, holidays, swipe, realtime, async data 관리

### `src/types/*`

- generated DB contract
- tab / push 등 앱 공용 타입

### `supabase/migrations/*`

- DB schema, RLS, helper RPC, 운영 fix의 source of truth

### `src/__tests__/*`

- API route, lib, hook, major component 회귀 테스트

## 5. Data Model Summary

### Core Entities

- `families`
  - 가족 tenant와 가족 초대 코드
- `family_members`
  - 사용자와 가족의 membership
- `allowed_emails`
  - 앱 접근 허용 이메일 + `app_role`
- `app_invites`
  - 앱 접근용 1회성 초대 코드
- `user_preferences`
  - 사용자별 UI/캘린더 설정

### Calendar Domain

- `calendars`
  - 가족 소속 캘린더
- `calendar_members`
  - 캘린더별 접근 제어
- `events`
  - 가족 또는 캘린더 범위 일정
- `event_reminders`
  - 일정별 reminder offset
- `event_votes`
  - 현재 UI 미구현

### Reminder Domain

- `shopping_lists`
  - 가족 소속 리마인더 목록
- `shopping_items`
  - 목록 내 아이템
- 위 두 테이블은 리마인더 도메인의 레거시 DB 물리명

### Push Domain

- `push_subscriptions`
  - 브라우저/디바이스별 Web Push endpoint

### Other Domain Tables

- `memos`
  - 현재 UI 미구현

## 6. ERD-Level Relationship Summary

```text
auth.users
  ├─< family_members >─ families
  ├─< user_preferences
  ├─< push_subscriptions
  └─< app_invites(created_by)

allowed_emails
  └─ app_role

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
- 앱 접근 허용과 가족 소속은 별개다. `allowed_emails`에 있어도 `family_members`에는 없을 수 있다.
- `family_members.user_id`는 사실상 사용자당 활성 가족 1개 모델을 만든다.
- `events.calendar_id = null`은 가족 전체 일정이다.
- `calendar_members`가 캘린더별 읽기/쓰기 권한의 기준이다.

## 7. Main Runtime Flows

### App Startup

1. `useAuth()`가 현재 세션을 확인한다.
2. `useFamily()`가 `/api/family/me`를 호출해 `familyId`와 `appRole`을 가져온다.
3. `useCalendars()`가 가족 캘린더를 읽는다.
4. `TabsShell`이 세 탭을 keep-alive 상태로 렌더링한다.
5. 가족이 없으면 `/onboarding`으로 리다이렉트한다.

### Login And Access Decision

1. `/login`에서 Google OAuth를 시작한다.
2. Supabase가 `/auth/callback`에서 세션을 자동 교환한다.
3. callback 페이지가 `/api/auth/check-allowed`를 호출한다.
4. 결과에 따라:
   - allowed + onboarding 필요 없음 → 원래 `next`로 이동
   - allowed + onboarding 필요 → `/onboarding`
   - not allowed → sign out 후 `/login?error=unauthorized`

### Family Creation / Join

1. allowed user가 가족이 없으면 `/onboarding`으로 이동한다.
2. 가족 생성은 `/api/family/create` -> `create_family_with_name` RPC로 수행한다.
3. 기존 가족 합류는 `/api/family/join` -> `join_family_by_invite_code` RPC로 수행한다.
4. 합류 후 앱의 tenant boundary는 새 `familyId`로 바뀐다.

### Event Mutation

1. `CalendarTab`이 `/api/events` 또는 `/api/events/[id]`를 호출한다.
2. API route가 요청 사용자의 가족/캘린더 write 권한을 검증한다.
3. create/update는 reminder까지 함께 RPC로 원자 저장한다.
4. 성공 후 현재 월 이벤트를 강제 refresh하고 realtime broadcast를 보낸다.
5. 이벤트 변경 push notification은 API route에서 비동기로 발송한다.

### Reminder Sync

1. `ReminderTab`이 가족별 목록을 읽고 module-level cache에 저장한다.
2. create/rename/delete/reorder 후 로컬 상태를 즉시 갱신한다.
3. mutation 성공 시 `family_lists_${familyId}` broadcast를 보낸다.
4. 다른 탭/기기는 realtime 수신 후 목록을 새로고침한다.
