# 개발 과제 & 해결 기록

Koko 개발 과정에서 마주친 기술적 과제와 해결 방법을 기록합니다.

---

## 1. 브라우저 탭 간 실시간 동기화

### 과제
장바구니 아이템을 추가/삭제할 때, 같은 브라우저에서 열린 다른 탭에 변경사항이 즉시 반영되지 않았다. 처음에는 Supabase Realtime의 `postgres_changes` 이벤트를 사용했지만, DELETE 이벤트의 `payload.old`에 `list_id` 같은 외래키 필드가 누락되어 있어 어느 목록의 아이템인지 식별이 불가능했다.

### 해결
두 레이어의 동기화 전략을 조합했다.

- **같은 브라우저 내 탭 간**: Web API인 `BroadcastChannel`을 사용. WebSocket 연결 없이 동기적으로 메시지가 전달되어 지연이 없다.
- **다른 기기 간**: Supabase Realtime의 Broadcast 채널을 사용. `postgres_changes` 대신 수동으로 `send()`를 호출해 refresh 이벤트를 전파한다.

또한 채널이 SUBSCRIBED 상태가 되기 전에 `send()`를 호출하면 REST API로 폴백되며 경고가 발생하는 문제가 있었다. `channelReadyRef`로 구독 완료 여부를 추적해 SUBSCRIBED 이후에만 broadcast를 전송하도록 개선했다.

```
BroadcastChannel (same browser) ─── 즉시 동기화
Supabase Realtime Broadcast     ─── 다른 기기 동기화
```

---

## 2. Optimistic UI의 UUID 불일치로 인한 아이템 부활 현상

### 과제
빠른 UI 반응을 위해 서버 응답 전에 임시 UUID로 아이템을 화면에 먼저 표시(Optimistic UI)했다. 이때 다른 탭에서 Realtime으로 목록을 새로고침하면 서버의 실제 UUID로 아이템이 들어온다. 이후 Optimistic 아이템을 삭제해도 DB에는 가짜 UUID로 삭제 요청이 가서 아무것도 삭제되지 않고, 다음 새로고침 시 아이템이 다시 나타나는 "부활" 현상이 발생했다.

### 해결
서버로부터 실제 응답을 받은 즉시 Optimistic 아이템을 실제 아이템으로 교체했다.

```typescript
// 임시 ID로 먼저 렌더링
setItems((prev) => [...prev, optimisticItem])

// 서버 응답 후 실제 ID로 교체
const realItem = await addShoppingItem(...)
setItems((prev) => prev.map((i) => i.id === optimisticItem.id ? realItem : i))
```

이후 삭제/수정 시에는 항상 실제 서버 UUID를 사용하게 되어 문제가 해결됐다.

---

## 3. Supabase RLS(Row Level Security) 정책 위반

### 과제
`shopping_items` 테이블의 INSERT/DELETE 시 RLS 정책에서 `42501 permission denied` 오류가 발생했다. 처음 작성한 정책은 `get_my_list_ids()` 함수를 WITH CHECK 절에서 서브쿼리로 사용했는데, RLS 컨텍스트에서 중첩 쿼리가 올바르게 동작하지 않았다.

### 해결
`get_my_list_ids()`를 `SECURITY DEFINER`로 정의해 RLS를 우회하는 방식을 사용하되, INSERT/DELETE 정책 자체는 `auth.uid() IS NOT NULL` 조건으로 단순화했다. 어차피 어떤 list에 아이템을 추가할 수 있는지는 애플리케이션 레벨에서 `family_id`로 제어되므로, RLS는 인증 여부만 확인하는 것으로 MVP 범위에서는 충분하다고 판단했다.

---

## 4. 가족 생성 시 레이스 컨디션

### 과제
로그인 직후 여러 탭이 동시에 열리면, 각 탭이 독립적으로 `/api/family` API를 호출해 가족이 중복 생성되는 문제가 있었다. 두 탭 모두 "내 가족이 없다"고 판단하고 각각 INSERT를 실행하기 때문이다.

### 해결
애플리케이션 레벨이 아닌 **DB 레벨에서 원자적으로 처리**했다.

1. `family_members` 테이블에 `user_id` 유니크 제약을 추가해 중복 삽입을 차단했다.
2. PL/pgSQL 함수 `get_or_create_family(p_user_id)`를 작성해, 조회와 생성을 하나의 트랜잭션으로 묶었다. `ON CONFLICT DO NOTHING`으로 동시 요청이 와도 하나만 성공하도록 처리했다.

```sql
CREATE OR REPLACE FUNCTION get_or_create_family(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_family_id uuid;
BEGIN
  -- 기존 가족 조회
  SELECT family_id INTO v_family_id
  FROM family_members WHERE user_id = p_user_id;

  IF v_family_id IS NULL THEN
    -- 원자적 생성
    INSERT INTO families (name) VALUES ('우리 가족')
    RETURNING id INTO v_family_id;

    INSERT INTO family_members (family_id, user_id, display_name, role)
    VALUES (v_family_id, p_user_id, 'Member', 'admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN v_family_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. 모달 하단 버튼이 네비게이션 바에 가려지는 문제

### 과제
PWA로 설치한 스마트폰에서 "새 장바구니" 모달을 열면 "만들기" 버튼이 잘려서 보이지 않았다. `max-h-[90vh]`와 `overflow-y-auto`로 스크롤을 추가하는 방식으로 한 번 수정했으나 문제가 재현됐다.

### 원인
모달 컨테이너(`fixed inset-0 flex items-end`)와 하단 네비게이션 바(`fixed bottom-0`)가 동일한 `z-50`를 사용하고 있었다. `items-end`는 모달 시트를 화면 최하단에 붙이는데, 네비게이션 바(약 64px)가 그 위를 덮어 버튼이 보이지 않는 구조였다. `max-h`로 높이를 제한해도 모달이 네비게이션 바 뒤에서 시작하기 때문에 근본 해결이 안 됐다.

### 해결
모달 외부 컨테이너에 `pb-16 sm:pb-0`을 추가했다. `flex items-end`는 패딩을 존중하므로, 모바일에서 모달 시트가 네비게이션 바 높이만큼 위로 올라가 버튼이 온전히 노출된다. 태블릿/데스크탑(`sm` 이상)에서는 패딩 없이 중앙 정렬이 유지된다.

```tsx
// 수정 전
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">

// 수정 후
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
```

---

## 6. 탭 전환 시 로딩 스피너 발생

### 과제
캘린더, 장바구니, 설정 탭을 이동할 때마다 스피너가 표시되며 로딩이 발생했다. 각 탭이 별도의 Next.js 라우트 페이지로 구성되어 있어, 탭 이동 시 컴포넌트가 언마운트 → 재마운트되고 Supabase 데이터를 새로 fetch하기 때문이다. 네이티브 앱처럼 로딩 없이 즉각적인 탭 전환이 필요했다.

### 해결
모든 탭 콘텐츠를 항상 마운트된 상태로 유지하고 CSS `display: none`으로 숨기는 방식(CSS Keep-Alive 패턴)을 적용했다.

- 각 페이지(`calendar/page.tsx`, `shopping/page.tsx`, `settings/page.tsx`)의 내용을 탭 컴포넌트(`CalendarTab`, `ShoppingTab`, `SettingsTab`)로 추출
- `TabsShell` 컴포넌트에서 세 탭을 동시에 렌더링하고 `display: contents` / `display: none`으로 가시성 제어
- `BottomNav`를 라우팅 모드(Link)와 콜백 모드(button + onTabChange) 둘 다 지원하도록 수정
- `/calendar`가 단일 진입점이 되고, `/shopping`과 `/settings`는 `/calendar`로 리다이렉트

Supabase Realtime 구독이 이미 각 탭에 구현되어 있어, 탭이 항상 마운트된 상태에서도 가족 구성원의 변경이 즉시 반영된다.

```
변경 전: 탭 클릭 → 페이지 라우팅 → 컴포넌트 마운트 → 데이터 fetch → 스피너 표시
변경 후: 탭 클릭 → activeTab 상태 변경 → display: none → display: contents (즉각 전환)
```

### 트레이드오프
- URL이 항상 `/calendar`로 고정됨 (내부 가족 앱이므로 실질적 문제 없음)
- 앱 초기 로딩 시 세 탭 데이터를 동시에 fetch함 (탭 수가 적고 데이터가 가벼워 영향 미미)

---

## 7. Supabase OAuth 자동 세션 교환으로 이메일 허용 목록 우회

### 과제
가족 전용 앱이므로 허용된 이메일만 로그인할 수 있도록 제한하는 기능을 구현했다. OAuth 콜백 페이지에서 `exchangeCodeForSession`으로 코드를 교환한 뒤 이메일을 검사하고, 허용 목록에 없으면 즉시 로그아웃하는 방식이었다. 그러나 실제 테스트에서 허용 목록에 없는 이메일도 로그인이 가능했다.

### 원인
`@supabase/supabase-js` v2는 기본적으로 `detectSessionInUrl: true`가 설정되어 있다. OAuth 콜백 URL(`?code=xxx`)이 로드되는 순간 Supabase 클라이언트가 **React 렌더링보다 먼저** 코드 교환을 자동 완료하고 세션을 저장한다. 이후 `useEffect`에서 수동으로 `exchangeCodeForSession`을 호출하면 코드가 이미 소진된 상태라 에러가 발생하고, 에러 핸들러가 `/login`으로 리다이렉트한다. 그런데 Supabase가 이미 세션을 설정해둔 상태이므로 로그인 페이지가 자동으로 `/shopping`으로 튕겨버려 이메일 체크가 완전히 우회됐다.

`detectSessionInUrl: false`로 자동 교환을 비활성화하면 이번엔 PKCE 코드 검증자(code verifier) 처리에 문제가 생겨 `exchangeCodeForSession` 자체가 실패했다.

### 해결
`exchangeCodeForSession`을 버리고 `onAuthStateChange`로 전략을 바꿨다. Supabase가 알아서 코드를 교환한 직후 `SIGNED_IN` 이벤트가 발생하는데, 이 시점에 이메일 허용 목록 체크를 수행한다. `getSession`과 `onAuthStateChange`를 함께 사용해 이벤트가 `useEffect` 등록 전에 발생하는 레이스 컨디션도 방지했다.

```
기존: 코드 교환(수동) → 이메일 체크 → 리다이렉트
       ↑ Supabase가 먼저 교환해버려 우회됨

변경: Supabase 자동 교환 → SIGNED_IN 이벤트 → 이메일 체크 → 허용/차단
```

허용 목록은 Supabase `allowed_emails` 테이블로 관리하며, 유효한 초대 코드를 통해 처음 로그인하는 사용자는 자동으로 테이블에 추가된다. 환경변수 방식은 Vercel 재배포 없이 멤버를 추가/제거할 수 없어 DB 방식으로 전환했다.

---

## 8. iOS Safari에서 캘린더 화면 상하 스크롤이 차단되지 않는 문제

### 과제
캘린더 화면은 `height: 100dvh`로 뷰포트 전체를 채우며, 세로 스크롤이 필요 없는 구조다. 그러나 모바일에서 화면을 위아래로 드래그하면 페이지가 따라서 움직였다.

### 시도 1 — 컨테이너에 touchmove 이벤트 방지 (실패)

```typescript
el.addEventListener('touchmove', (e) => {
  if (!isModalOpen) e.preventDefault()
}, { passive: false })
```

iOS Safari에서는 `body`가 스크롤 가능한 상태이면 자식 엘리먼트에서 `e.preventDefault()`를 호출해도 body 레벨 스크롤이 막히지 않았다.

### 시도 2 — document 레벨로 이벤트 이동 (실패)

```typescript
document.addEventListener('touchmove', (e) => {
  if (!isModalOpen && el.contains(e.target as Node)) e.preventDefault()
}, { passive: false })
```

`body`에 `min-h-full`이 설정되어 있어 스크롤 가능한 상태인 점은 동일했다. Shopping 탭은 body 스크롤을 사용하므로 `overflow: hidden`을 전역으로 추가할 수도 없었다. 결과적으로 iOS Safari에서 여전히 스크롤이 발생했다.

### 해결 — CSS `touch-action: none`

```tsx
<div
  style={{ height: '100dvh', touchAction: isModalOpen ? 'auto' : 'none' }}
>
```

JavaScript 이벤트 핸들러 방식은 iOS Safari에서 body 스크롤을 신뢰성 있게 막지 못한다. CSS `touch-action: none`은 브라우저에게 "이 요소에서 터치 기반 스크롤/줌 제스처를 처리하지 말 것"을 직접 지시하므로 JavaScript보다 앞선 레이어에서 동작한다.

모달이 열렸을 때(`isModalOpen: true`)는 `auto`로 복원해 모달 내부의 `overflow-y-auto` 스크롤 영역이 정상 동작하게 했다. 좌우 스와이프 월 이동은 JavaScript `touchstart`/`touchend` 이벤트로 구현되어 있어 `touch-action`의 영향을 받지 않는다.

```
실패: JS e.preventDefault() → iOS Safari body 스크롤 레이어에서 무시됨
해결: CSS touch-action: none → 브라우저가 스크롤 시도 자체를 하지 않음
```
