'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, ShoppingCart, AlertTriangle } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import type { AuthState } from '@/types/tabs'
import {
  getShoppingListsWithPreviews,
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
  reorderShoppingLists,
} from '@/lib/shopping'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import { CreateListModal } from '@/components/shopping/CreateListModal'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import type { ShoppingListWithPreview, ListType } from '@/lib/shopping'

// 라우트 이동으로 컴포넌트가 언마운트되어도 데이터를 유지하는 세션 캐시.
// familyId는 마운트 시점에 미확정이므로 keyed Map 대신 단순 변수로 보관.
let lastKnownLists: ShoppingListWithPreview[] | null = null

type Props = AuthState

export function ShoppingTab({ user, familyId, isInitializing }: Props) {
  const [lists, setLists] = useState<ShoppingListWithPreview[]>(
    () => lastKnownLists ?? []
  )
  const [fetchError, setFetchError] = useState(false)
  const [showModal, setShowModal] = useState(false)

  // lastKnownLists가 null이면 한 번도 로드된 적 없는 첫 진입 → 스피너 표시
  // null이 아니면 캐시 데이터가 있으므로 auth 초기화 중에도 즉시 표시
  const loading = isInitializing && lastKnownLists === null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const updateLists = (value: ShoppingListWithPreview[] | ((prev: ShoppingListWithPreview[]) => ShoppingListWithPreview[])) => {
    setLists((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      lastKnownLists = next
      return next
    })
  }

  const refresh = useCallback(() => {
    if (!familyId) return
    getShoppingListsWithPreviews(familyId)
      .then(updateLists)
      .catch((e) => {
        console.error('[ShoppingTab] getShoppingListsWithPreviews failed:', e)
        setFetchError(true)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  const broadcast = useRealtimeSync(familyId ? `family_lists_${familyId}` : null, refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async (name: string, type: ListType) => {
    if (!familyId || !user) return

    const optimisticList: ShoppingListWithPreview = {
      id: crypto.randomUUID(),
      family_id: familyId,
      created_by: user.id,
      name,
      type,
      sort_order: 0,
      created_at: new Date().toISOString(),
      previewItems: [],
    }
    updateLists((prev) => [optimisticList, ...prev])
    setShowModal(false)

    const realList = await createShoppingList(familyId, user.id, name, type)
    updateLists((prev) => prev.map((l) => l.id === optimisticList.id ? { ...realList, previewItems: [] } : l))
    broadcast()
  }

  const handleDelete = async (listId: string) => {
    updateLists((prev) => prev.filter((l) => l.id !== listId))
    await deleteShoppingList(listId)
    broadcast()
  }

  const handleRename = async (listId: string, name: string) => {
    updateLists((prev) => prev.map((l) => l.id === listId ? { ...l, name } : l))
    await renameShoppingList(listId, name)
    broadcast()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    updateLists((prev) => {
      const oldIndex = prev.findIndex((l) => l.id === active.id)
      const newIndex = prev.findIndex((l) => l.id === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      const updates = reordered.map((l, i) => ({ id: l.id, sort_order: i }))
      reorderShoppingLists(updates)
      broadcast()
      return reordered.map((l, i) => ({ ...l, sort_order: i }))
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-8 pb-24 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">장바구니</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {lists.length > 0 ? `${lists.length}개의 목록` : '장바구니를 만들어보세요'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-accent-400 hover:bg-accent-500 text-white shadow-sm transition-colors"
          aria-label="새 장바구니 추가"
        >
          <Plus size={20} />
        </button>
      </div>

      {fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 font-medium">목록을 불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">잠시 후 다시 시도해주세요</p>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShoppingCart size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 font-medium">아직 장바구니가 없어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">위의 + 버튼을 눌러보세요</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={lists.map((l) => l.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {lists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  previewItems={list.previewItems}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showModal && (
        <CreateListModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
