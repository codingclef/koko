# PATTERNS.md

# Koko Implementation Patterns

이 문서는 현재 코드베이스에서 반복적으로 검증된 구현 방식만 정리한다.
기능 소개와 파일 지도는 `docs/PROJECT_MAP.md`, 과거 버그 배경은 `docs/CHALLENGES.md`를 본다.

## 1. Layer Rules

```text
DB migration -> src/types/database.ts -> src/lib/* -> src/hooks/* -> src/app/* -> src/components/*
```

- 각 레이어는 바로 아래 레이어에만 의존한다.
- `src/lib/*`에는 Supabase 접근, API client helper, 순수 유틸만 둔다.
- `src/hooks/*`에는 여러 화면에서 재사용할 상태 로직만 둔다.
- `src/app/*`에는 route entry와 API route만 둔다.
- `src/components/*`는 UI 조합과 로컬 인터랙션 상태를 담당한다.
- Realtime 구독 소유권은 탭 컨테이너나 페이지에 둔다. leaf 컴포넌트에 두지 않는다.

## 2. App Shell And Routing

- `/calendar`가 가족 앱의 단일 live entry point다.
- `/shopping`, `/settings`는 독립 화면이 아니라 `/calendar` 탭 셸로 리다이렉트한다.
- 실제 탭 상태는 route path가 아니라 `/calendar?tab=shopping` 같은 search param으로 제어한다.
- `TabsShell`은 `CalendarTab`, `ShoppingTab`, `SettingsTab`를 항상 마운트하고 `display`만 바꾼다.
- 탭 상태 유지가 목적이므로 탭별 개별 route로 다시 분리하지 않는다.
- 장보기 상세도 메인 흐름에서는 `/calendar?tab=shopping&list=<id>` search param으로 연다.
- `src/app/shopping/[id]/page.tsx`는 canonical page가 아니라 구형 링크용 bridge route다.

## 3. Data And API Boundaries

- 클라이언트는 anon Supabase client로 직접 접근 가능한 데이터만 `src/lib/*`를 통해 읽고 쓴다.
- service role key가 필요한 작업은 반드시 API route로 감싼다.
- 클라이언트 코드에서 `SUPABASE_SERVICE_ROLE_KEY`를 사용하지 않는다.
- 인증이 필요한 API route는 `src/lib/api-auth.ts`의 helper를 사용해 사용자 식별을 처리한다.
- 클라이언트에서 API route를 호출할 때는 `src/lib/api-client.ts`의 auth helper로 bearer token을 붙인다.
- 권한 검증, 원자 저장, cross-table mutation, push fan-out이 필요한 로직은 API route + admin client + DB RPC 조합을 우선한다.

## 4. Auth And Onboarding Flow

- 로그인은 Google OAuth만 사용한다.
- OAuth callback에서는 `exchangeCodeForSession`을 호출하지 않는다.
- Supabase 자동 세션 교환 후 `getSession()`과 `onAuthStateChange()`로 callback를 처리한다.
- 앱 접근 허용의 source of truth는 `allowed_emails`다.
- `allowed_emails.app_role`은 앱 관리자 권한을 나타낸다.
- 앱 초대 링크는 `/join-app?code=...`, 가족 초대 링크는 `/join?code=...`로 구분한다.
- 앱 초대 소비는 `/api/auth/check-allowed` -> `consume_app_invite(code, email)` RPC로 원자 처리한다.
- 가족 초대 링크 진입 시 allowlist 추가와 실제 가족 합류는 분리한다.
- allowed user이지만 `familyId === null`인 사용자는 `TabsShell`에서 `/onboarding`으로 보낸다.
- 가족 생성은 `/api/family/create` -> `create_family_with_name` RPC로 명시적 처리한다.
- 가족 합류는 `/api/family/join` -> `join_family_by_invite_code` RPC로 처리한다.
- 가족 조회에는 `/api/family/me` -> `get_my_family` RPC를 사용한다.
- 클라이언트에서 select 후 insert로 가족 생성/합류를 흉내 내지 않는다.

## 5. Realtime Pattern

- Supabase Realtime은 `postgres_changes`가 아니라 Broadcast 채널만 사용한다.
- 변경 후 자동 반영을 기대하지 말고 mutation 성공 뒤 수동 `broadcast()`를 호출한다.
- `broadcast()`는 채널이 `SUBSCRIBED` 상태일 때만 보낸다.
- `channelReadyRef` 없이 `channel.send()`를 호출하지 않는다.
- 구독 훅은 `src/hooks/useRealtimeSync.ts` 패턴을 재사용한다.
- 채널명은 기능 경계가 드러나야 한다.
- 가족 범위 데이터는 `family_*_${familyId}` 형식을 우선한다.
- 월별 이벤트는 `family_events_${familyId}_${year}_${month}`처럼 조회 범위와 맞춘다.
- 상세/부분 범위 데이터는 `list_items_${listId}`처럼 더 좁은 범위를 사용한다.

## 6. Calendar Patterns

- 월 이벤트 조회는 `getEventsByMonth(familyId, year, month)`처럼 month window 단위로 제한한다.
- 현재 월 외에도 인접 월 prefetch를 허용하지만, cache는 유한 크기로 유지한다.
- `events.calendar_id = null`은 가족 전체 일정이다.
- 캘린더 생성 시 owner 멤버를 먼저 insert하고 일반 멤버를 그 다음에 넣는다.
- 캘린더 멤버 수정은 "owner 유지 + 나머지 전체 교체" 패턴으로 다룬다.
- 이벤트 생성/수정은 클라이언트에서 테이블을 직접 건드리지 않고 `/api/events` 계열 route를 사용한다.
- 이벤트 생성/수정 시 reminder도 함께 저장한다. event와 reminder를 분리 저장하지 않는다.
- reminder 원자 저장은 `create_event_with_reminders`, `update_event_with_reminders` RPC에 맡긴다.
- 이 RPC들은 service role route에서만 호출한다. 클라이언트 실행 권한을 다시 열지 않는다.
- 이벤트 저장 후에는 현재 가족 월 cache를 비우고 refresh + broadcast 순서로 정합성을 맞춘다.
- 캘린더 메인 화면은 `height: 100dvh`와 `touchAction` 제어를 사용한다.
- 세로 스크롤 차단이 필요하면 JS `preventDefault()`보다 CSS `touch-action`을 우선한다.

## 7. Shopping Patterns

- 장보기 목록과 아이템 생성은 optimistic UI를 허용한다.
- optimistic UUID는 서버 응답을 받는 즉시 실제 DB row로 치환해야 한다.
- optimistic UUID를 후속 수정/삭제/정렬 mutation의 기준 ID로 쓰지 않는다.
- 목록 정렬과 아이템 정렬은 `sort_order`를 명시적으로 저장한다.
- 재정렬 시 UI를 먼저 갱신하되, 실제 `sort_order` mutation도 즉시 보낸다.
- 장보기 탭은 keep-alive 탭 전환과 상세 진입 복귀를 위해 가족별 module-level cache를 사용한다.
- 이런 캐시는 탭 전환 성능과 초기 스피너 감소가 명확할 때만 추가한다.

## 8. Preferences And Theme

- 사용자 설정은 `user_preferences` 한 테이블로 모은다.
- 테마는 DB와 클라이언트 저장소를 함께 사용한다.
- `persistTheme()`는 `localStorage`와 cookie를 같이 갱신해야 한다.
- SSR 첫 페인트 전 테마 적용은 `src/app/layout.tsx`의 inline head script가 담당한다.
- 클라이언트에서만 테마를 바꾸고 SSR fallback을 빼면 FOUC가 다시 생긴다.

## 9. Push And Notification Pattern

- push subscription 등록은 API route를 통해 저장한다.
- reminder 발송과 이벤트 변경 알림은 서로 다른 목적이다.
- reminder는 cron route가 `event_reminders`를 기준으로 보낸다.
- 이벤트 변경 알림은 이벤트 create/update/delete API route가 비동기로 발송한다.
- actor 본인에게는 이벤트 변경 push를 보내지 않는다.
- 404/410으로 만료된 구독은 발송 시점에 정리한다.

## 10. Modal And Mobile Layout Rules

- 하단 네비게이션이 있는 일반 모달 컨테이너에는 `pb-16 sm:pb-0`를 넣는다.
- 이 패딩이 없으면 PWA 모바일에서 CTA가 하단 탭 바 뒤로 가려질 수 있다.
- z-index 기본 규칙은 아래를 따른다.

| Layer | z-index |
| --- | --- |
| BottomNav | `z-50` |
| 일반 모달 | `z-50` + `pb-16 sm:pb-0` |
| 삭제 확인 다이얼로그 | `z-[60]` |
| 최상위 모달 또는 중첩 시트 | `z-[70]` |

## 11. Testing Expectations

- 코드 변경 시 관련 테스트를 같이 갱신한다.
- 우선 위치는 `src/__tests__/lib`, `src/__tests__/hooks`, `src/__tests__/api`, `src/__tests__/components`, `src/__tests__/shopping`, `src/__tests__/settings`다.
- API route를 추가하거나 권한 로직을 바꾸면 route 테스트를 먼저 보강한다.
- 회귀 위험이 큰 변경은 "lib 테스트 + 화면/훅 테스트"를 함께 추가하는 쪽을 우선한다.
- 코드 작업 마무리 전 `npx tsc --noEmit`를 실행한다.

## 12. Forbidden Patterns

| Forbidden | Why |
| --- | --- |
| RLS 정책에서 `family_members` 직접 서브쿼리 | 무한 재귀 또는 예측 불가한 정책 평가 위험 |
| 자식 테이블 `WITH CHECK`에서 JOIN 기반 권한 검사 | 중첩 RLS에서 `permission denied`가 다시 발생하기 쉬움 |
| `channelReadyRef` 없이 realtime broadcast 전송 | `SUBSCRIBED` 전 호출 시 REST fallback 경고와 누락 가능성 |
| optimistic 임시 UUID로 후속 mutation 실행 | 삭제, 수정, 정렬 후 데이터 부활 버그 |
| OAuth callback에서 `exchangeCodeForSession` 호출 | Supabase 자동 코드 교환과 충돌 |
| 앱 초대 consume을 select -> insert -> update로 분리 | 동시 요청 시 코드가 중복 소비될 수 있음 |
| 이벤트 생성/수정을 클라이언트 direct table mutation으로 처리 | 권한 검증과 reminder 원자 저장이 깨진다 |
| 클라이언트 코드에서 service role key 사용 | 비밀키 노출 |
| 탭을 다시 개별 route page로 분리 | 탭 전환 시 상태 손실과 스피너 회귀 |
| 수동 테마 저장 시 cookie 갱신 생략 | SSR 초기 렌더와 hydration 사이 FOUC 재발 |

## 13. When To Read Challenges

- realtime 흐름을 수정할 때
- RLS 정책이나 migration을 수정할 때
- 앱 초대, 이메일 허용 목록, OAuth callback 흐름을 바꿀 때
- 이벤트 API route 또는 reminder 저장 방식을 바꿀 때
- 모달, 탭 셸, 모바일 터치 동작을 바꿀 때

위 경우는 먼저 `docs/CHALLENGES.md`를 읽고 같은 버그를 재도입하지 않는지 확인한다.
