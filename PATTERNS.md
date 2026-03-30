# PATTERNS.md — Koko 구현 컨벤션

> 기능 추가·수정 시 이 문서의 패턴을 그대로 따른다.
> 배경 정보(스키마 전체, 마이그레이션 이력 등)는 `research.md` 참조.

---

## 1. 아키텍처 한눈에 보기

```
DB migration → src/types/database.ts → src/lib/xxx.ts → (src/hooks/useXxx.ts) → src/app/xxx/page.tsx → src/components/xxx/
```

- 각 레이어는 **아래 레이어에만** 의존한다
- page가 hook 없이 직접 lib를 호출해도 된다 (hook은 필요할 때만)
- 실시간 동기화는 **page 레이어**에서만 관리한다

---

## 2. 오퍼레이션 레시피

### 2-1. Optimistic Create

```typescript
const handleCreate = async (name: string) => {
  if (!familyId || !user) return
  const optimistic: Xxx = {
    id: crypto.randomUUID(),          // ★ 임시 UUID
    family_id: familyId,
    created_by: user.id,
    name,
    sort_order: 0,
    created_at: new Date().toISOString(),
  }
  setItems(prev => [...prev, optimistic])    // 즉시 렌더
  const real = await createXxx(familyId, user.id, name)
  setItems(prev => prev.map(i => i.id === optimistic.id ? real : i))  // ★ UUID 교체 필수
  broadcast()
}
```

> ★ UUID 교체를 빠뜨리면 삭제/수정 시 아이템이 되살아나는 버그 발생

### 2-2. Optimistic Delete

```typescript
const handleDelete = async (id: string) => {
  setItems(prev => prev.filter(i => i.id !== id))  // 즉시 제거
  await deleteXxx(id)
  broadcast()
}
```

### 2-3. Optimistic Update (이름 변경 등)

```typescript
const handleRename = async (id: string, name: string) => {
  setItems(prev => prev.map(i => i.id === id ? { ...i, name } : i))
  await renameXxx(id, name)
  broadcast()
}
```

### 2-4. Drag-and-Drop 정렬

```typescript
// sensors: 모든 드래그 가능 페이지에서 동일 설정 사용
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
)

const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  setItems(prev => {
    const oldIndex = prev.findIndex(i => i.id === active.id)
    const newIndex = prev.findIndex(i => i.id === over.id)
    const reordered = arrayMove(prev, oldIndex, newIndex)
    reorderXxx(reordered.map((i, idx) => ({ id: i.id, sort_order: idx })))
    broadcast()
    return reordered.map((i, idx) => ({ ...i, sort_order: idx }))
  })
}
```

JSX:
```tsx
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
    {items.map(item => <XxxCard key={item.id} item={item} ... />)}
  </SortableContext>
</DndContext>
```

드래그 가능한 컴포넌트 내부:
```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: item.id })
const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

<div ref={setNodeRef} style={style}>
  <button {...attributes} {...listeners} className="... touch-none cursor-grab active:cursor-grabbing">
    <GripVertical size={16} />
  </button>
  ...
</div>
```

### 2-5. 실시간 동기화 셋업

page의 `useEffect` 안에서 설정. BroadcastChannel(같은 브라우저 탭) + Supabase Realtime(다른 기기) **둘 다 필수**.

```typescript
// 상단 ref 선언
const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
const channelReadyRef = useRef(false)   // ★ SUBSCRIBED 체크용
const bcRef = useRef<BroadcastChannel | null>(null)

useEffect(() => {
  if (!familyId) return

  const refresh = () =>
    getXxx(familyId)
      .then(setItems)
      .catch(e => { console.error('[XxxPage]', e); setFetchError(true) })
  refresh()

  const bc = new BroadcastChannel(`koko-xxx-${familyId}`)  // ★ 채널명: koko-{기능}-{familyId}
  bc.onmessage = refresh
  bcRef.current = bc

  const channel = supabase
    .channel(`family_xxx_${familyId}`)   // ★ 채널명: family_{기능}_{familyId}
    .on('broadcast', { event: 'refresh' }, refresh)
    .subscribe(status => {
      channelReadyRef.current = status === 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') refresh()
    })
  channelRef.current = channel

  return () => {
    bc.close()
    channelReadyRef.current = false      // ★ cleanup 시 반드시 false로
    supabase.removeChannel(channel)
  }
}, [familyId])

const broadcast = () => {
  bcRef.current?.postMessage('refresh')
  if (channelRef.current && channelReadyRef.current)  // ★ ready 체크 후 send
    channelRef.current.send({ type: 'broadcast', event: 'refresh', payload: {} })
}
```

---

## 3. DB 레이어 패턴

### 3-1. 테이블 기본 구조

```sql
create table xxx (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,    -- ★ 항상
  created_by uuid not null references auth.users(id) on delete cascade,  -- ★ 항상
  name       text not null,
  sort_order integer not null default 0,               -- 정렬 필요 시
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()        -- 수정 추적 필요 시
);

-- updated_at 자동 갱신 (수정 추적 필요 시)
create trigger xxx_updated_at
  before update on xxx
  for each row execute function update_updated_at();
```

### 3-2. RLS 정책

**최상위 테이블** (family_id 직접 보유):
```sql
alter table xxx enable row level security;
create policy "family members can manage xxx"
  on xxx for all
  using (family_id in (select get_my_family_ids()));  -- ★ 직접 서브쿼리 금지
```

**자식 테이블** (부모 FK를 통해 family에 접근):
```sql
-- ★ SECURITY DEFINER 함수 필수 (WITH CHECK 중첩 RLS 버그 방지)
create or replace function get_my_xxx_ids()
returns setof uuid language sql security definer stable as $$
  select x.id from xxx x where x.family_id in (select get_my_family_ids())
$$;

create policy "family members can manage yyy"
  on yyy for all
  using   (xxx_id in (select get_my_xxx_ids()))
  with check (xxx_id in (select get_my_xxx_ids()));  -- ★ with check도 함수 사용
```

### 3-3. `database.ts` 업데이트

마이그레이션 후 `src/types/database.ts`의 `Tables` 블록에 새 테이블 타입(Row/Insert/Update/Relationships) 추가.

---

## 4. lib/ 패턴

파일: `src/lib/xxx.ts`

```typescript
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Xxx = Database['public']['Tables']['xxx']['Row']

// 목록 — data null이면 빈 배열 반환
export async function getXxx(familyId: string): Promise<Xxx[]> {
  const { data, error } = await supabase
    .from('xxx').select('*').eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error   // ★ try/catch 없이 그대로 throw
  return data ?? []        // ★ null 방어
}

// 생성 — 생성된 row 반환
export async function createXxx(familyId: string, userId: string, name: string): Promise<Xxx> {
  const { data, error } = await supabase
    .from('xxx').insert({ family_id: familyId, created_by: userId, name })
    .select().single()
  if (error) throw error
  return data
}

// 이름 변경 — void
export async function renameXxx(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('xxx').update({ name }).eq('id', id)
  if (error) throw error
}

// 일반 업데이트 (updated_at 있는 테이블) — void
export async function updateXxx(id: string, updates: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase
    .from('xxx').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// 삭제 — void
export async function deleteXxx(id: string): Promise<void> {
  const { error } = await supabase.from('xxx').delete().eq('id', id)
  if (error) throw error
}

// 재정렬 — Promise.all (에러 무시, 부분 실패 허용)
export async function reorderXxx(updates: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('xxx').update({ sort_order }).eq('id', id)
    )
  )
}
```

---

## 5. hook 패턴

hook은 **여러 페이지에서 공유하는 데이터** 또는 **의존성 체인**이 있을 때만 만든다.
단일 페이지 전용 데이터는 page의 `useEffect`에서 직접 처리.

```typescript
'use client'
import { useEffect, useState } from 'react'
import { getXxx, type Xxx } from '@/lib/xxx'

export function useXxx(familyId: string | null) {
  const [items, setItems] = useState<Xxx[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async (fid: string) => {
    try {
      setItems(await getXxx(fid))
    } catch (e) {
      console.error('[useXxx] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!familyId) return
    refresh(familyId)
  }, [familyId])

  return { items, loading, reload: () => { if (familyId) refresh(familyId) } }
}
```

---

## 6. page 패턴

```typescript
'use client'
export default function XxxPage() {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const router = useRouter()

  // ★ 인증 가드 — 모든 보호 페이지 필수
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  const [items, setItems] = useState<Xxx[]>([])
  const [fetchError, setFetchError] = useState(false)
  // ... refs (실시간 동기화용, 2-5 참조)

  // 실시간 셋업 (2-5 참조)
  useEffect(() => { /* ... */ }, [familyId])

  // ★ 로딩 중 스피너 — 모든 페이지 동일 마크업
  if (authLoading || familyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24 min-h-screen">
      {/* 에러 상태 */}
      {fetchError && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-stone-500 dark:text-stone-400 font-medium">불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">잠시 후 다시 시도해주세요</p>
        </div>
      )}
      {/* ... 콘텐츠 */}
      <BottomNav />
    </div>
  )
}
```

---

## 7. 컴포넌트 UI 패턴

### 7-1. 모달 (바텀시트 + 데스크탑 센터)

```tsx
// ★ pb-16 sm:pb-0 — BottomNav(z-50, ~64px)에 가려지지 않도록
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
  <div className="relative w-full sm:max-w-sm bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
    <div className="overflow-y-auto flex-1 p-6">
      {/* 폼 내용 */}
    </div>
    {/* 하단 버튼 */}
    <div className="px-6 pb-6 pt-2 shrink-0">
      <button
        disabled={!isValid || loading}
        className="w-full py-3 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
      >
        {loading ? '처리 중...' : '만들기'}
      </button>
    </div>
  </div>
</div>
```

바텀시트만 원할 때 (캘린더 스타일):
```tsx
<div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={onClose}>
  <div className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-2xl pb-safe max-h-[90vh] flex flex-col"
    onClick={e => e.stopPropagation()}>
```

### z-index 규칙

| 레이어 | z-index |
|--------|---------|
| BottomNav | `z-50` |
| 일반 모달 | `z-50` (+ `pb-16 sm:pb-0`) |
| 삭제 확인 다이얼로그 | `z-[60]` |
| 최상위 모달 (다른 시트 위) | `z-[70]` |

### 7-2. 삭제 확인 다이얼로그

컴포넌트 내부 상태:
```typescript
const [confirming, setConfirming] = useState(false)
```

삭제 버튼 (모바일 항상 표시 / 데스크탑 hover):
```tsx
<button
  onClick={e => { e.stopPropagation(); setConfirming(true) }}
  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 rounded-xl
             text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
>
  <Trash2 size={16} />
</button>
```

다이얼로그:
```tsx
{confirming && (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/40" onClick={() => setConfirming(false)} />
    <div className="relative bg-white dark:bg-stone-900 rounded-2xl w-full sm:max-w-xs p-6 shadow-xl">
      <p className="font-semibold text-stone-800 dark:text-stone-100 mb-1">XXX 삭제</p>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
        &ldquo;{item.name}&rdquo;을(를) 삭제할까요?
      </p>
      <div className="flex gap-3">
        <button onClick={() => setConfirming(false)}
          className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-sm">
          취소
        </button>
        <button onClick={() => { setConfirming(false); onDelete(item.id) }}
          className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm">
          삭제
        </button>
      </div>
    </div>
  </div>
)}
```

### 7-3. 인라인 이름 편집

```typescript
const [editing, setEditing] = useState(false)
const [editValue, setEditValue] = useState(item.name)

const commitEdit = () => {
  const trimmed = editValue.trim()
  if (trimmed && trimmed !== item.name) onRename(item.id, trimmed)
  else setEditValue(item.name)  // 빈값이면 원래 이름 복원
  setEditing(false)
}
```

```tsx
{editing ? (
  <input
    autoFocus
    value={editValue}
    onChange={e => setEditValue(e.target.value)}
    onFocus={e => { const len = e.target.value.length; e.target.setSelectionRange(len, len) }}
    onBlur={commitEdit}
    onKeyDown={e => {
      if (e.key === 'Enter') commitEdit()
      if (e.key === 'Escape') { setEditValue(item.name); setEditing(false) }
    }}
    onClick={e => e.stopPropagation()}
    className="w-full font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-b border-orange-400 outline-none"
  />
) : (
  <span onClick={e => { e.stopPropagation(); setEditValue(item.name); setEditing(true) }}>
    {item.name}
  </span>
)}
```

### 7-4. 폼 입력 필드 공통 className

```
// 텍스트 입력
"w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base"

// 주 액션 버튼
"px-4 py-2 rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-semibold text-sm transition-colors shadow-sm"

// 비활성화 추가 시
"disabled:opacity-40"
```

---

## 8. 테스트 패턴

### 8-1. lib/ 함수 테스트

```typescript
// ★ 모든 lib 테스트에서 동일한 mock factory 사용
function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'update', 'delete', 'eq', 'ilike', 'gte', 'lte', 'order'].forEach(m => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(p)
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  ;(chain as { finally: unknown }).finally = p.finally.bind(p)
  return chain
}

const mockFrom = jest.fn()
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }))
beforeEach(() => { jest.clearAllMocks(); mockFrom.mockImplementation(() => makeChain({ data: null, error: null })) })
```

각 함수 최소 3개 케이스:
```typescript
describe('getXxx', () => {
  it('데이터를 반환한다', async () => {
    const mock = [{ id: 'x-1', name: '테스트' }]
    mockFrom.mockReturnValue(makeChain({ data: mock, error: null }))
    expect(await getXxx('fam-1')).toEqual(mock)
  })
  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    expect(await getXxx('fam-1')).toEqual([])
  })
  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    await expect(getXxx('fam-1')).rejects.toEqual({ message: 'DB error' })
  })
})
```

### 8-2. API 라우트 테스트

```typescript
/** @jest-environment node */  // ★ 반드시 node 환경

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/xxx', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})
```

API 테스트 필수 케이스: 파라미터 누락(400) · 성공(200) · DB 에러(500)

---

## 9. 새 기능 카테고리 추가 체크리스트

```
- [ ] supabase/migrations/YYYYMMDDHHMMSS_add_xxx.sql
        테이블 + RLS (3-1, 3-2 참조)
        자식 테이블 있으면 get_my_xxx_ids() 추가
        sort_order 필요 여부 결정
        updated_at + trigger 필요 여부 결정
- [ ] src/types/database.ts — 새 테이블 타입 추가
- [ ] src/lib/xxx.ts — CRUD 함수 (4 참조)
- [ ] src/hooks/useXxx.ts — 공유 데이터면 hook, 아니면 생략 (5 참조)
- [ ] src/app/xxx/page.tsx — 인증 가드 + 실시간 셋업 (2-5, 6 참조)
- [ ] src/components/xxx/ — 필요한 컴포넌트
- [ ] src/components/BottomNav.tsx — navItems 추가
- [ ] src/__tests__/lib/xxx.test.ts
- [ ] src/__tests__/api/xxx.test.ts (API route 있으면)
```

---

## 10. 금지 패턴

| 금지 | 이유 | 대안 |
|------|------|------|
| RLS 정책에서 `family_members` 직접 서브쿼리 | 무한 재귀 | `get_my_family_ids()` 사용 |
| 자식 테이블 WITH CHECK에서 JOIN 서브쿼리 | 중첩 RLS 권한 거부 | `get_my_xxx_ids()` SECURITY DEFINER |
| `channelReadyRef` 없이 `channel.send()` | SUBSCRIBED 전 호출 시 REST 폴백 경고 | ready 체크 후 send |
| Optimistic 임시 UUID로 DB 조작 | 삭제/수정 시 아이템 부활 버그 | 서버 응답 즉시 UUID 교체 |
| OAuth 콜백에서 `exchangeCodeForSession` | Supabase 자동 교환과 충돌, 체크 우회 | `onAuthStateChange('SIGNED_IN')` |
| 클라이언트에서 `SUPABASE_SERVICE_ROLE_KEY` 사용 | 키 노출 | API route에서만 service role |
| lib 함수에서 error catch 후 무시 | 상위 에러 처리 불가 | `if (error) throw error` |
| BroadcastChannel 없이 Realtime만 사용 | 같은 브라우저 탭 간 동기화 지연 | **검토 필요**: 장바구니는 이중화, 캘린더는 Realtime만 사용 중 — 의도적 결정인지 누락인지 확인 후 기준 확정 |
| 모달에 `pb-16 sm:pb-0` 누락 | PWA 모바일에서 버튼이 BottomNav에 가려짐 | 항상 추가 |
