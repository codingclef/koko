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
const cachedListsByFamily = new Map<string, ShoppingListWithPreview[]>()

function getCachedLists(familyId: string | null): ShoppingListWithPreview[] | null {
  if (!familyId) return null
  return cachedListsByFamily.get(familyId) ?? null
}

export function clearShoppingTabCache() {
  cachedListsByFamily.clear()
}

type Props = AuthState

export function ShoppingTab({ user, familyId, isInitializing }: Props) {
  const [lists, setLists] = useState<ShoppingListWithPreview[]>(
    () => getCachedLists(familyId) ?? []
  )
  const [listsFamilyId, setListsFamilyId] = useState<string | null>(familyId)
  const [fetchError, setFetchError] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const visibleLists = listsFamilyId === familyId ? lists : getCachedLists(familyId) ?? []

  // 현재 family 기준 캐시가 없으면 첫 진입으로 간주한다.
  const loading = isInitializing && getCachedLists(familyId) === null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const updateLists = useCallback((value: ShoppingListWithPreview[] | ((prev: ShoppingListWithPreview[]) => ShoppingListWithPreview[])) => {
    setLists((prev) => {
      const base = listsFamilyId === familyId ? prev : getCachedLists(familyId) ?? []
      const next = typeof value === 'function' ? value(base) : value
      if (familyId) {
        cachedListsByFamily.set(familyId, next)
      }
      return next
    })
    setListsFamilyId(familyId)
  }, [familyId, listsFamilyId])

  useEffect(() => {
    const cached = getCachedLists(familyId)
    setLists(cached ?? [])
    setListsFamilyId(familyId)
    setFetchError(false)
    setMutationError(null)
  }, [familyId])

  const refresh = useCallback(() => {
    if (!familyId) return
    getShoppingListsWithPreviews(familyId)
      .then((nextLists) => {
        updateLists(nextLists)
        setFetchError(false)
      })
      .catch((e) => {
        console.error('[ShoppingTab] getShoppingListsWithPreviews failed:', e)
        setFetchError(true)
      })
  }, [familyId, updateLists])

  const broadcast = useRealtimeSync(familyId ? `family_lists_${familyId}` : null, refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async (name: string, type: ListType): Promise<boolean> => {
    if (!familyId || !user) return false

    setMutationError(null)
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

    try {
      const realList = await createShoppingList(familyId, user.id, name, type)
      updateLists((prev) => prev.map((l) => l.id === optimisticList.id ? { ...realList, previewItems: [] } : l))
      setShowModal(false)
      broadcast()
      return true
    } catch (e) {
      console.error('[ShoppingTab] createShoppingList failed:', e)
      updateLists((prev) => prev.filter((l) => l.id !== optimisticList.id))
      setMutationError('목록을 저장하지 못했어요')
      return false
    }
  }

  const handleDelete = async (listId: string) => {
    setMutationError(null)
    const previousLists = visibleLists
    updateLists((prev) => prev.filter((l) => l.id !== listId))

    try {
      await deleteShoppingList(listId)
      broadcast()
    } catch (e) {
      console.error('[ShoppingTab] deleteShoppingList failed:', e)
      updateLists(previousLists)
      setMutationError('목록을 삭제하지 못했어요')
    }
  }

  const handleRename = async (listId: string, name: string) => {
    setMutationError(null)
    const previousLists = visibleLists
    updateLists((prev) => prev.map((l) => l.id === listId ? { ...l, name } : l))

    try {
      await renameShoppingList(listId, name)
      broadcast()
    } catch (e) {
      console.error('[ShoppingTab] renameShoppingList failed:', e)
      updateLists(previousLists)
      setMutationError('목록 이름을 저장하지 못했어요')
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMutationError(null)
    const oldIndex = visibleLists.findIndex((l) => l.id === active.id)
    const newIndex = visibleLists.findIndex((l) => l.id === over.id)
    const reordered = arrayMove(visibleLists, oldIndex, newIndex).map((l, i) => ({ ...l, sort_order: i }))
    updateLists(reordered)

    try {
      await reorderShoppingLists(reordered.map(({ id, sort_order }) => ({ id, sort_order })))
      broadcast()
    } catch (e) {
      console.error('[ShoppingTab] reorderShoppingLists failed:', e)
      updateLists(visibleLists)
      setMutationError('목록 순서를 저장하지 못했어요')
    }
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
            {visibleLists.length > 0 ? `${visibleLists.length}개의 목록` : '장바구니를 만들어보세요'}
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

      {mutationError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
          {mutationError}
        </div>
      )}

      {fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 font-medium">목록을 불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">잠시 후 다시 시도해주세요</p>
        </div>
      ) : visibleLists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShoppingCart size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 font-medium">아직 장바구니가 없어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">위의 + 버튼을 눌러보세요</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleLists.map((l) => l.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleLists.map((list) => (
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
