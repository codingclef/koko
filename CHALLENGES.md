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
