<h1><img src="public/logo.webp" alt="Koko 로고" width="40" /> Koko — 패밀리 허브</h1>

**[한국어]** | [日本語](README.ja.md) | [English](README.md)

Koko는 하나의 공유 앱 셸을 중심으로 동작하는 가족 협업 PWA입니다.
현재 제품 범위는 캘린더, 반복 일정, 리마인더 목록, 가족 초대/합류, 사용자 설정, Web Push 알림입니다.

## 현재 구현 범위

- 이메일 허용 목록으로 제한된 Google OAuth 로그인
- 명시적 가족 생성과 초대 코드 기반 가족 합류
- 가족 공용 일정, 캘린더별 가시성, 반복 일정, 일정 라벨 색상을 지원하는 캘린더
- Web Push 기반 이벤트 리마인더와 일일 일정 요약
- 실시간 동기화와 드래그 정렬을 지원하는 리마인더 목록
- 테마, 공휴일 국가, 음력 표시를 위한 사용자 설정
- 모바일과 데스크톱에서 설치 가능한 PWA 경험

현재 UI에 구현되지 않은 항목:

- 메모
- 일정 투표

이 항목들은 스키마와 생성된 타입에는 존재하지만, 현재 프런트엔드 흐름에는 연결되어 있지 않습니다.

## 런타임 구조

앱은 하나의 가족 셸을 계속 마운트한 상태로 사용합니다.

- `/calendar`가 실제 탭 앱의 단일 진입 라우트입니다
- `/reminders`, `/settings`는 `/calendar` 탭 셸로 다시 리다이렉트됩니다
- `TabsShell`이 calendar, reminders, settings 탭을 계속 마운트한 채로 유지하고 표시만 전환합니다

이 구조 덕분에 탭 전환 시 재로딩 스피너가 줄고, 탭 상태도 유지됩니다.

## 실시간 동기화 모델

Koko는 `postgres_changes`가 아니라 Supabase Realtime Broadcast를 사용합니다.

패턴은 다음과 같습니다.

1. mutation을 수행합니다.
2. 필요한 로컬 상태를 갱신합니다.
3. 채널이 `SUBSCRIBED` 상태가 된 뒤 수동으로 `refresh` broadcast를 보냅니다.

이 방식은 다음 범위에 사용됩니다.

- 가족 단위 리마인더 목록 새로고침
- 특정 리마인더 목록 내부 아이템 새로고침
- 가족 단위 캘린더 이벤트 새로고침과 월 범위 재조회

## 인증 및 가족 모델

- 로그인은 Google OAuth만 사용합니다.
- OAuth 코드 교환은 Supabase가 자동으로 처리합니다.
- 콜백 페이지에서 로그인된 이메일을 `allowed_emails` 기준으로 검증합니다.
- 유효한 초대 코드로 들어온 첫 로그인 이메일은 콜백 검증 과정에서 자동 허용될 수 있습니다.
- `/api/family/me`는 DB RPC를 호출해 현재 가족과 앱 역할을 조회합니다.
- `/api/family/create`는 온보딩 중 DB RPC를 호출해 가족을 명시적으로 생성합니다.
- `/api/family/join`은 DB RPC를 호출해 초대 코드로 다른 가족에 합류시킵니다.

활성 가족은 캘린더, 리마인더 목록, 가족 구성원 데이터의 테넌트 경계입니다.

## 기술 스택

| 분류 | 기술 |
| --- | --- |
| 프런트엔드 | Next.js 16, React 19, TypeScript |
| 스타일링 | Tailwind CSS v4 |
| 백엔드 / DB | Supabase Auth, PostgreSQL, Realtime Broadcast |
| 알림 | Web Push + service worker |
| 호스팅 | Vercel |
| 테스트 | Jest + Testing Library |

## 프로젝트 구조

```text
src/
  app/                라우트 진입점과 API route
  components/         UI 조합과 탭 컨테이너
  hooks/              공용 클라이언트 훅
  lib/                Supabase CRUD, API 헬퍼, 유틸리티
  types/              생성된 DB 타입과 공용 앱 타입
  __tests__/          API, lib, hook, component, 기능 회귀 테스트
public/
  manifest.json       PWA 매니페스트
  sw.js               푸시 알림용 서비스 워커
supabase/
  migrations/         스키마, RLS, RPC, 운영 수정 이력
```

프로젝트를 수정할 때는 아래 문서 순서로 읽는 것을 권장합니다.

1. `AGENTS.md`
2. `docs/PROJECT_MAP.md`
3. `docs/PATTERNS.md`
4. `docs/CHALLENGES.md`

## 주요 파일

- [`src/components/TabsShell.tsx`](/Users/codingclef/workspace_codex/koko/src/components/TabsShell.tsx): keep-alive 앱 셸
- [`src/components/tabs/CalendarTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/CalendarTab.tsx): 캘린더 런타임 컨테이너
- [`src/components/tabs/ReminderTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/ReminderTab.tsx): 리마인더 개요 컨테이너
- [`src/components/tabs/SettingsTab.tsx`](/Users/codingclef/workspace_codex/koko/src/components/tabs/SettingsTab.tsx): 설정 및 가족 액션
- [`src/hooks/useRealtimeSync.ts`](/Users/codingclef/workspace_codex/koko/src/hooks/useRealtimeSync.ts): 공용 broadcast 구독 패턴
- [`src/app/api/family/me/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/me/route.ts): 현재 가족과 앱 역할 조회
- [`src/app/api/family/create/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/create/route.ts): 명시적 가족 생성
- [`src/app/api/family/join/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/family/join/route.ts): 초대 코드 기반 가족 합류
- [`src/app/api/cron/send-reminders/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/send-reminders/route.ts): 예약 리마인더 발송
- [`src/app/api/cron/daily-digest/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/daily-digest/route.ts): 일일 일정 요약 발송
- [`src/app/api/cron/cleanup-reminders/route.ts`](/Users/codingclef/workspace_codex/koko/src/app/api/cron/cleanup-reminders/route.ts): 지난 발송 완료 리마인더 정리

## 환경 변수

`.env.local`에 최소한 아래 값을 설정해야 합니다.

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

각 변수의 용도:

- `NEXT_PUBLIC_SUPABASE_URL`: 공용 Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 브라우저 클라이언트 인증 및 일반 데이터 접근
- `SUPABASE_SERVICE_ROLE_KEY`: RPC와 보호 테이블 접근용 서버 admin client
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: 브라우저 푸시 구독 등록
- `VAPID_PRIVATE_KEY`: 서버 측 푸시 발송
- `CRON_SECRET`: cron endpoint 보호
- `KASI_HOLIDAY_API_KEY`: 공휴일 오버레이에 사용하는 한국 공공데이터 공휴일 API 키
- `KASI_HOLIDAY_API_KEY_EXPIRES_AT`: KASI 키 만료 경고에 사용하는 선택적 `YYYY-MM-DD` 만료일

## 로컬 개발

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

일상적으로 권장하는 명령:

```bash
npm run lint
npm run test
npx tsc --noEmit
```

## 테스트

현재 저장소에는 다음 영역의 회귀 테스트가 포함되어 있습니다.

- API routes
- Supabase 연동 `lib/*`
- 공용 hooks
- 캘린더, 리마인더, 설정, 셸 UI 동작

코드를 변경할 때는 관련 테스트를 함께 갱신하고, 작업 완료 전에 `npx tsc --noEmit`를 실행해야 합니다.

## 데이터베이스 메모

스키마와 RLS는 `supabase/migrations`에 있습니다.

현재 중요한 테이블:

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
- 위 두 테이블은 리마인더 도메인의 레거시 DB 물리명입니다
- `push_subscriptions`
- `daily_digest_log`

현재 중요한 RPC 및 migration 기반 동작:

- 명시적 가족 생성과 legacy 원자적 가족 bootstrap
- 초대 코드 기반 원자적 가족 합류
- 리마인더 조회 및 sent-at 마킹
- 발송 완료 리마인더 정리
- 반복 일정 series 생성, 수정, 삭제
- 가족, 리마인더, 캘린더 멤버십 흐름의 RLS 수정

## 문서 메모

`docs/PATTERNS.md`는 유지해야 할 구현 규칙을 정리합니다.
`docs/CHALLENGES.md`는 그 규칙이 생긴 버그와 회귀 배경을 기록합니다.
