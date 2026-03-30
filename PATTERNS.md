# PATTERNS.md — Koko 구현 컨벤션

> 기존 코드에서 유추 가능한 것은 적지 않는다.
> 구현 참조는 코드에서 직접 읽는다: `shopping/page.tsx`, `ShoppingListCard.tsx`, `lib/shopping.ts`

---

## 1. 레이어 파이프라인

```
DB migration → database.ts → lib/ → (hook/) → app/page → components/
```

각 레이어는 아래 레이어에만 의존. 실시간 동기화는 page 레이어에서만 관리.

---

## 2. 새 기능 카테고리 추가 체크리스트

```
- [ ] supabase/migrations/YYYYMMDDHHMMSS_xxx.sql
- [ ] src/types/database.ts — 새 테이블 타입 추가
- [ ] src/lib/xxx.ts
- [ ] src/hooks/useXxx.ts (여러 페이지 공유 시에만)
- [ ] src/app/xxx/page.tsx
- [ ] src/components/xxx/
- [ ] src/components/BottomNav.tsx — navItems 추가
- [ ] src/__tests__/lib/xxx.test.ts
- [ ] src/__tests__/api/xxx.test.ts (API route 있을 때)
```

---

## 3. 비자명 규칙

**z-index 계층** (여러 파일에 흩어져 있어 파악하기 어려움)

| 레이어 | z-index |
|--------|---------|
| BottomNav | `z-50` |
| 일반 모달 | `z-50` + `pb-16 sm:pb-0` 필수 |
| 삭제 확인 다이얼로그 | `z-[60]` |
| 최상위 모달 (다른 시트 위) | `z-[70]` |

**`pb-16 sm:pb-0`** — 일반 모달 컨테이너에 반드시 추가. 없으면 PWA 모바일에서 버튼이 BottomNav에 가려짐.

---

## 4. 금지 패턴

버그 발생 경험 기반. 자세한 경위는 `CHALLENGES.md` 참조.

| 금지 | 이유 |
|------|------|
| RLS 정책에서 `family_members` 직접 서브쿼리 | 무한 재귀 → `get_my_family_ids()` 사용 |
| 자식 테이블 WITH CHECK에서 JOIN 서브쿼리 | 중첩 RLS 권한 거부 → `get_my_xxx_ids()` SECURITY DEFINER |
| `channelReadyRef` 없이 `channel.send()` | SUBSCRIBED 전 호출 시 REST 폴백 경고 |
| Optimistic 임시 UUID로 DB 조작 | 삭제/수정 시 아이템 부활 버그 |
| OAuth 콜백에서 `exchangeCodeForSession` | Supabase 자동 교환과 충돌 |
| 클라이언트에서 `SUPABASE_SERVICE_ROLE_KEY` | 키 노출 — API route에서만 사용 |

---

## 5. 결정 이력

- **실시간 동기화**: 초기에 장바구니는 BroadcastChannel + Supabase Realtime 이중화를 사용했으나, Supabase Realtime 단일 방식으로 통일. 신규 기능은 Realtime만 사용한다.
