# 개발 과제 & 해결 기록

Koko 개발 과정에서 실제로 문제를 만들었거나, 다시 깨질 가능성이 높은 기술 이슈와 해결 방식을 기록한다.
새 작업이 아래 주제와 닿아 있으면 구현 전에 먼저 읽는다.

---

## 1. 브라우저 탭과 기기 간 실시간 동기화

### 과제

같은 브라우저의 다른 탭, 또는 다른 기기에서 장보기와 캘린더 변경이 즉시 반영되지 않았다.
초기에는 `postgres_changes`를 검토했지만, 삭제 payload 정보가 충분하지 않거나 UI 단위 refresh 경계와 잘 맞지 않았다.

### 해결

Supabase Realtime Broadcast 기반으로 단순화했다.

- mutation 성공 뒤 필요한 로컬 refresh를 수행한다.
- 이어서 `refresh` broadcast를 수동 전송한다.
- 수신 측은 같은 범위의 데이터를 다시 읽는다.

또한 채널이 `SUBSCRIBED` 되기 전에 `send()`를 호출하면 REST fallback 경고가 발생하고 메시지 누락 가능성이 있었다.
그래서 `useRealtimeSync`에서 `channelReadyRef`를 두고, `SUBSCRIBED` 이후에만 broadcast를 보낸다.

### 남은 규칙

- 자동 전파를 기대하지 않는다.
- 데이터 범위와 채널 범위를 맞춘다.
- `channel.send()`를 직접 흩뿌리지 말고 `useRealtimeSync` 패턴을 재사용한다.

---

## 2. Optimistic UI 임시 UUID로 인한 데이터 부활

### 과제

장보기 아이템/목록을 optimistic UUID로 먼저 렌더링한 뒤, 그 임시 ID를 그대로 삭제/수정/정렬에 사용하면 서버 row와 ID가 맞지 않아 아이템이 "삭제된 것처럼 보였다가 다시 살아나는" 문제가 생겼다.

### 해결

서버 응답을 받는 즉시 optimistic row를 실제 DB row로 치환했다.

```typescript
setItems((prev) => [...prev, optimisticItem])

const realItem = await addShoppingItem(...)
setItems((prev) =>
  prev.map((item) => item.id === optimisticItem.id ? realItem : item)
)
```

### 남은 규칙

- optimistic ID를 후속 mutation key로 쓰지 않는다.
- create 계열 optimistic UI는 반드시 "실제 row 치환"까지 포함해야 한다.

---

## 3. Supabase RLS 정책의 재귀와 중첩 권한 실패

### 과제

`family_members`를 직접 서브쿼리하는 RLS 정책과, 자식 테이블 `WITH CHECK`에서 JOIN 기반 검사를 넣은 정책은 예상보다 쉽게 무한 재귀나 `permission denied`를 만들었다.
특히 `shopping_items`, `calendar_members` 주변에서 이런 문제가 반복됐다.

### 해결

- 가족 범위 판정은 `get_my_family_ids()` 같은 helper 함수 기반으로 단순화했다.
- 복잡한 다중 테이블 권한 검사는 가능하면 API route + service role 쪽으로 이동했다.
- `calendar_members` bootstrap은 owner 선삽입 패턴을 전제로 맞췄다.

### 남은 규칙

- RLS 안에서 권한 모델을 과도하게 표현하려 하지 않는다.
- 중첩 정책이 필요한 순간 API route로 경계를 옮기는 편이 더 안전하다.

---

## 4. 가족 생성/합류를 클라이언트 다중 요청으로 처리했을 때의 레이스 컨디션

### 과제

로그인 직후 여러 탭이 동시에 열리면 "가족이 없으면 만들기"를 클라이언트 select -> insert 흐름으로 처리할 경우 중복 가족 생성이나 membership 충돌이 발생했다.
가족 합류도 조회와 업데이트를 분리하면 동시 요청에서 정합성이 깨질 수 있었다.

### 해결

가족 생성과 합류를 DB 함수로 옮겨 원자 처리했다.

- `get_or_create_family(p_user_id)`는 legacy bootstrap 경로를 담당한다.
- `create_family_with_name(p_user_id, p_name)`는 현재 온보딩의 명시적 가족 생성을 담당한다.
- `join_family_by_invite_code(...)`는 가족 이동을 원자 처리한다.

### 남은 규칙

- 가족 생성/합류는 클라이언트에서 select 후 insert로 구현하지 않는다.
- 온보딩 접근 여부와 가족 존재 여부를 분리해서 본다.

---

## 5. OAuth 자동 세션 교환으로 허용 목록 검사가 우회된 문제

### 과제

초기에는 callback 페이지에서 `exchangeCodeForSession`을 수동 호출한 뒤 `allowed_emails`를 검사했다.
하지만 Supabase가 URL의 code를 먼저 자동 교환해 세션을 저장해버려, 수동 교환은 실패하고 이메일 검사가 우회되는 케이스가 생겼다.

### 해결

- `exchangeCodeForSession`을 제거했다.
- `getSession()`과 `onAuthStateChange()`를 함께 사용해 세션 확보 시점을 잡았다.
- 세션이 생긴 직후 `/api/auth/check-allowed`를 호출해 허용 여부를 최종 판정한다.

### 남은 규칙

- callback에서 세션 교환을 직접 다시 시도하지 않는다.
- callback 검증은 "세션 생성 이후 판정" 모델로 유지한다.

---

## 6. 앱 초대 코드 소비를 분리 처리했을 때의 중복 사용 문제

### 과제

앱 초대 코드를 "조회 -> 사용 처리 -> allowlist insert"로 나누면, 거의 동시에 두 요청이 들어왔을 때 같은 코드가 중복 소비될 수 있었다.
또 앱 초대와 가족 초대의 의미가 섞이면 허용 목록 추가, 온보딩 이동, 가족 합류 경계가 무너지기 쉬웠다.

### 해결

- 앱 초대는 `consume_app_invite(code, email)` RPC 한 번으로 소비한다.
- callback 응답에 `needsOnboarding`를 포함해, 앱 접근 허용과 가족 생성 여부를 분리했다.
- 가족 초대는 allowlist 허용만 수행하고 실제 가족 합류는 `/join`에서 처리한다.

### 남은 규칙

- 앱 초대와 가족 초대는 서로 다른 목적의 링크로 유지한다.
- 앱 초대 소비는 반드시 원자 RPC로 처리한다.

---

## 7. 모달 CTA가 하단 네비게이션 바에 가려진 문제

### 과제

모바일 PWA에서 하단에서 올라오는 모달의 CTA가 고정 BottomNav 뒤로 가려졌다.
단순 `max-h`나 내부 스크롤 추가만으로는 구조적으로 해결되지 않았다.

### 해결

모달 외부 컨테이너에 `pb-16 sm:pb-0`을 추가했다.
`flex items-end` 컨테이너가 패딩을 존중하므로, 모바일에서는 시트가 네비게이션 바 높이만큼 위로 올라간다.

### 남은 규칙

- BottomNav와 같은 레벨에서 뜨는 일반 모달은 기본적으로 `pb-16 sm:pb-0`을 둔다.

---

## 8. 탭 전환마다 스피너가 발생하던 문제

### 과제

캘린더, 장보기, 설정을 각각 별도 페이지로 운용할 때 탭 전환 시 언마운트/재마운트가 발생해 fetch와 스피너가 반복됐다.
모바일 앱 같은 연속성이 깨졌다.

### 해결

- `/calendar`를 단일 live entry로 고정했다.
- `TabsShell`이 세 탭을 모두 마운트한 상태로 유지하고 `display`만 전환한다.
- 장보기 상세도 메인 흐름에서는 search param 기반으로 유지한다.

### 남은 규칙

- 탭을 다시 개별 route page로 쪼개지 않는다.
- 독립 route가 필요하면 bridge 또는 외부 링크 호환 목적이 분명해야 한다.

---

## 9. iOS Safari에서 캘린더 세로 스크롤이 막히지 않던 문제

### 과제

캘린더는 `100dvh` 고정 화면인데, iOS Safari에서는 `touchmove`를 막아도 body 레벨 스크롤이 계속 살아 있었다.

### 해결

JS `preventDefault()` 대신 CSS `touch-action: none`을 사용했다.
모달이 열렸을 때만 `auto`로 되돌려 모달 내부 스크롤을 허용한다.

### 남은 규칙

- iOS 터치 스크롤 제어는 JS 이벤트보다 CSS `touch-action`을 우선한다.

---

## 10. 이벤트와 리마인더를 순차 저장했을 때의 부분 실패 문제

### 과제

이벤트 row 저장과 `event_reminders` 저장을 클라이언트 또는 API에서 순차 처리하면, 앞 단계만 성공하고 뒤 단계가 실패하는 부분 저장 상태가 생길 수 있었다.
또 클라이언트 direct mutation은 캘린더 write 권한과 family membership 권한 검증을 우회하기 쉬웠다.

### 해결

- 이벤트 생성/수정을 API route로 이동했다.
- create/update는 각각 `create_event_with_reminders`, `update_event_with_reminders` RPC로 묶었다.
- 해당 RPC의 anon/authenticated execute 권한을 제거해 route를 우회하지 못하게 했다.

### 남은 규칙

- 이벤트 생성/수정은 반드시 `/api/events` 계열 route를 통한다.
- event와 reminder는 분리 저장하지 않는다.

---

## 11. 이벤트 변경 알림 fan-out을 클라이언트에서 처리할 수 없던 문제

### 과제

일정 생성/수정/삭제 후 관련 가족 또는 캘린더 멤버에게 push notification을 보내려면 actor 제외, 캘린더 멤버 조회, 구독 조회, 만료 구독 정리가 필요했다.
이 흐름은 클라이언트에서 안전하게 수행할 수 없었다.

### 해결

- 이벤트 변경 push는 API route에서 비동기로 발송한다.
- 캘린더 일정이면 `calendar_members`, 가족 전체 일정이면 `family_members`를 기준으로 대상을 결정한다.
- actor 본인은 제외한다.
- 404/410 구독은 즉시 정리한다.

### 남은 규칙

- cross-user notification fan-out은 클라이언트에 두지 않는다.
- 발송 실패가 사용자 mutation 자체를 실패시키지 않도록 비동기로 분리한다.

---

## 언제 먼저 읽어야 하나

아래 변경은 구현 전에 이 문서를 먼저 본다.

- realtime 채널 구조를 바꿀 때
- RLS 정책이나 migration을 수정할 때
- OAuth callback, allowlist, 앱 초대 흐름을 손볼 때
- 가족 생성/합류 로직을 바꿀 때
- 이벤트 저장/리마인더/API route를 수정할 때
- 탭 셸, 모달, 모바일 터치 동작을 바꿀 때
