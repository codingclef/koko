# PATTERNS.md

# Koko Implementation Patterns

이 문서는 "현재 코드베이스에서 반복적으로 검증된 구현 방식"만 정리한다.
기능 소개나 파일 목록은 `PROJECT_MAP.md`를 보고, 과거 버그의 배경은 `CHALLENGES.md`를 본다.

## 1. Layer Rules

```text
DB migration -> src/types/database.ts -> src/lib/* -> src/hooks/* -> src/app/* -> src/components/*
```

- 각 레이어는 바로 아래 레이어에만 의존한다.
- `src/lib/*`는 Supabase CRUD, API 호출, 순수 유틸만 둔다.
- `src/hooks/*`는 여러 화면에서 재사용할 상태 로직만 둔다.
- `src/app/*`는 라우트 진입점과 API route만 둔다.
- `src/components/*`는 UI 조합과 로컬 인터랙션만 담당한다.
- Realtime 구독 소유권은 탭 컨테이너나 페이지에 둔다. 하위 leaf 컴포넌트에 두지 않는다.

## 2. App Shell And Routing

- `/calendar`가 가족 앱의 단일 live entry point다.
- `/shopping`과 `/settings`는 독립 화면이 아니라 `/calendar`로 리다이렉트한다.
- 실제 탭 상태는 URL path가 아니라 `/calendar?tab=shopping` 같은 search param으로 제어한다.
- `TabsShell`은 `CalendarTab`, `ShoppingTab`, `SettingsTab`를 항상 마운트하고 `display: none` 또는 `display: contents`로 가시성만 바꾼다.
- 탭 전환 시 기존 상태를 유지해야 하므로, "탭마다 별도 페이지 라우팅 후 재마운트" 패턴을 다시 도입하지 않는다.
- 예외적으로 장보기 상세는 [`src/app/shopping/[id]/page.tsx`](/Users/codingclef/workspace/koko/src/app/shopping/[id]/page.tsx)처럼 별도 라우트로 유지한다.

## 3. Data And API Boundaries

- 클라이언트 컴포넌트는 Supabase anon client로 직접 읽고 쓸 수 있는 데이터만 `src/lib/*`를 통해 접근한다.
- 서비스 롤 키가 필요한 작업은 반드시 API route로 감싼다.
- 클라이언트에서 `SUPABASE_SERVICE_ROLE_KEY`를 직접 사용하지 않는다.
- 인증이 필요한 API route는 [`src/lib/api-auth.ts`](/Users/codingclef/workspace/koko/src/lib/api-auth.ts)의 `getAuthenticatedUserId()` 패턴을 사용한다.
- 클라이언트에서 API route를 호출할 때는 [`src/lib/api-client.ts`](/Users/codingclef/workspace/koko/src/lib/api-client.ts)의 `getAuthHeaders()`로 access token을 붙인다.
- 가족 생성, 가족 합류, 이메일 허용 목록 판정처럼 원자성이 중요한 로직은 DB 함수와 admin client로 처리한다.

## 4. Auth And Family Flow

- 로그인은 Google OAuth만 사용한다.
- OAuth callback에서는 `exchangeCodeForSession`을 호출하지 않는다.
- Supabase 자동 세션 교환 후 `getSession()` 또는 `onAuthStateChange()`에서 이메일 허용 목록을 검사한다.
- 허용 목록은 `allowed_emails` 테이블이 source of truth다.
- 초대 코드로 진입한 신규 사용자는 `/api/auth/check-allowed`에서 허용 목록에 추가될 수 있다.
- 로그인 직후 가족 조회는 `/api/family/me` -> `get_my_family` RPC(조회 전용)로 처리한다.
- 가족 합류는 `/api/family/join` -> `join_family_by_invite_code` RPC 흐름으로 처리한다.
- 가족 직접 생성은 `/api/family/create` -> `create_family_with_name` RPC로 처리한다.
- "가족이 없으면 클라이언트에서 select 후 insert" 같은 다중 요청 패턴은 레이스 컨디션을 만든다. 사용하지 않는다.
- 앱 초대 코드 소비는 `consume_app_invite(code, email)` RPC 한 번으로 원자 처리한다. 조회 → insert → update를 분리하면 동시 요청 시 코드가 두 번 소비된다.
- **온보딩 접근 정책**: 가족이 없는 allowed user는 초대 경로(앱 초대 vs 가족 초대)와 무관하게 `/onboarding`에서 가족을 생성할 수 있다. 앱 초대는 이 상태에 도달하는 대표 경로일 뿐, 온보딩 접근의 유일한 자격 조건은 아니다.

## 5. Realtime Pattern

- Supabase Realtime은 `postgres_changes`가 아니라 Broadcast 채널만 사용한다.
- 변경 후 자동 전파를 기대하지 말고, mutation 성공 뒤 수동 `broadcast()`를 호출한다.
- `broadcast()`는 채널이 `SUBSCRIBED` 상태일 때만 보내야 한다.
- `channelReadyRef` 없이 `channel.send()`를 호출하지 않는다.
- 구독 훅은 [`src/hooks/useRealtimeSync.ts`](/Users/codingclef/workspace/koko/src/hooks/useRealtimeSync.ts) 패턴을 재사용한다.
- 채널명은 기능 경계가 드러나야 한다.
- 가족 범위 데이터는 `family_*_${familyId}` 형태를 우선한다.
- 상세 화면 단위 데이터는 `list_items_${listId}`처럼 더 좁은 범위를 사용한다.

## 6. Calendar Patterns

- 월별 이벤트 조회는 `getEventsByMonth(familyId, year, month)`처럼 month window 단위로 제한한다.
- `events.calendar_id = null`은 가족 전체 일정이다. 캘린더 미지정 오류로 취급하지 않는다.
- 캘린더 생성 시 owner 멤버를 먼저 insert하고, 그 다음 일반 멤버를 넣는다.
- 이 순서는 `calendar_members` 부트스트랩 RLS를 통과하기 위한 전제다.
- 캘린더 멤버 수정은 "전체 교체" 방식으로 다룬다. owner는 항상 유지한다.
- 이벤트 저장 시 reminder도 함께 맞춘다. 이벤트만 저장하고 reminder를 방치하지 않는다.
- 캘린더 메인 화면은 `height: 100dvh`와 `touchAction` 제어를 사용한다.
- 캘린더에서 세로 스크롤 차단이 필요하면 JS `preventDefault()`보다 CSS `touch-action`을 우선한다.

## 7. Shopping Patterns

- 장보기 목록과 아이템 생성은 optimistic UI를 허용한다.
- 단, optimistic UUID는 서버 응답을 받는 즉시 실제 DB row로 치환해야 한다.
- optimistic UUID를 그대로 수정, 삭제, 정렬 mutation에 사용하지 않는다.
- 목록 정렬과 아이템 정렬은 `sort_order`를 명시적으로 저장한다.
- 재정렬 시 UI를 먼저 갱신하되, 실제 `sort_order` 업데이트도 즉시 보낸다.
- 장보기 탭은 keep-alive 탭 전환을 위해 module-level session cache(`lastKnownLists`)를 사용한다.
- 비슷한 캐시는 "탭 언마운트 방지와 초기 스피너 최소화"가 분명할 때만 추가한다.

## 8. Preferences And Theme

- 사용자 설정은 `user_preferences` 한 테이블로 모은다.
- 테마는 DB와 클라이언트 저장소를 함께 사용한다.
- `persistTheme()`는 `localStorage`와 cookie를 같이 갱신해야 한다.
- SSR 초기 페인트 전 테마 적용은 [`src/app/layout.tsx`](/Users/codingclef/workspace/koko/src/app/layout.tsx)의 inline head script가 담당한다.
- 클라이언트에서만 테마를 바꾸고 SSR fallback을 빼면 FOUC가 다시 생긴다.

## 9. Modal And Mobile Layout Rules

- 하단 네비게이션이 있는 일반 모달 컨테이너에는 `pb-16 sm:pb-0`를 넣는다.
- 이 패딩이 없으면 PWA 모바일에서 CTA가 하단 탭 바 뒤로 가려질 수 있다.
- z-index 기본 규칙은 아래를 따른다.

| Layer | z-index |
| --- | --- |
| BottomNav | `z-50` |
| 일반 모달 | `z-50` + `pb-16 sm:pb-0` |
| 삭제 확인 다이얼로그 | `z-[60]` |
| 최상위 모달 또는 중첩 시트 | `z-[70]` |

## 10. Testing Expectations

- 코드 변경 시 관련 테스트를 같이 갱신한다.
- 우선 위치는 `src/__tests__/lib`, `src/__tests__/hooks`, `src/__tests__/api`, `src/__tests__/components`, `src/__tests__/shopping`, `src/__tests__/settings`다.
- 회귀 위험이 큰 변경은 "lib 테스트 + 화면/훅 테스트"를 함께 추가하는 쪽을 우선한다.
- 작업 마무리 전 `npx tsc --noEmit`를 실행한다.

## 11. Forbidden Patterns

| Forbidden | Why |
| --- | --- |
| RLS 정책에서 `family_members` 직접 서브쿼리 | 무한 재귀 또는 예측 불가한 정책 평가 위험 |
| 자식 테이블 `WITH CHECK`에서 JOIN 기반 권한 검사 | 중첩 RLS에서 `permission denied`가 다시 발생하기 쉬움 |
| `channelReadyRef` 없이 realtime broadcast 전송 | `SUBSCRIBED` 전 호출 시 REST fallback 경고와 누락 가능성 |
| optimistic 임시 UUID로 후속 mutation 실행 | 삭제, 수정, 정렬 후 데이터 부활 버그 |
| OAuth callback에서 `exchangeCodeForSession` 호출 | Supabase 자동 코드 교환과 충돌 |
| 클라이언트 코드에서 service role key 사용 | 비밀키 노출 |
| 탭을 별도 route page로 재분리 | 탭 전환 시 상태 손실과 로딩 스피너 회귀 |
| 수동 테마 저장 시 cookie 갱신 생략 | SSR 초기 렌더와 hydration 사이 FOUC 재발 |

## 12. When To Read Challenges

- Realtime을 수정할 때
- RLS 정책이나 migration을 수정할 때
- 모달, 탭 셸, 모바일 터치 동작을 바꿀 때
- OAuth callback이나 이메일 허용 목록 흐름을 바꿀 때

위 경우는 먼저 `CHALLENGES.md`를 읽고 같은 버그를 재도입하지 않는지 확인한다.
