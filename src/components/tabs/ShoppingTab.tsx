'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, ListChecks, AlertTriangle, ListFilter } from 'lucide-react'
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
  getReminderGroups,
  createReminderGroup,
  updateReminderGroup,
  deleteReminderGroup,
  setReminderGroupMembers,
  getShoppingListsWithPreviews,
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
  reorderShoppingLists,
} from '@/lib/shopping'
import { getFamilyMembers, type FamilyMember } from '@/lib/calendar'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import { ShoppingDetailView } from '@/components/shopping/ShoppingDetailView'
import { CreateListModal } from '@/components/shopping/CreateListModal'
import { ReminderGroupListSheet } from '@/components/shopping/ReminderGroupListSheet'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import type { ShoppingListWithPreview, ListType, ShoppingItem, ReminderGroup } from '@/lib/shopping'

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [lists, setLists] = useState<ShoppingListWithPreview[]>(
    () => getCachedLists(familyId) ?? []
  )
  const [fetchError, setFetchError] = useState(false)
  const [groups, setGroups] = useState<ReminderGroup[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showGroupList, setShowGroupList] = useState(false)

  const activeListId = useMemo(() => {
    const raw = searchParams.get('list')?.trim()
    return raw ? raw : null
  }, [searchParams])

  // 현재 family 기준 캐시가 없으면 첫 진입으로 간주한다.
  const loading = isInitializing && getCachedLists(familyId) === null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const updateLists = useCallback((value: ShoppingListWithPreview[] | ((prev: ShoppingListWithPreview[]) => ShoppingListWithPreview[])) => {
    setLists((prev) => {
      const base = getCachedLists(familyId) ?? prev
      const next = typeof value === 'function' ? value(base) : value
      if (familyId) {
        cachedListsByFamily.set(familyId, next)
      }
      return next
    })
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

  const refreshGroups = useCallback(() => {
    if (!familyId) return Promise.resolve()
    return Promise.allSettled([getReminderGroups(familyId), getFamilyMembers(familyId)])
      .then(([groupsResult, membersResult]) => {
        if (groupsResult.status === 'fulfilled') {
          setGroups(groupsResult.value)
        } else {
          console.error('[ShoppingTab] getReminderGroups failed:', groupsResult.reason)
        }

        if (membersResult.status === 'fulfilled') {
          setFamilyMembers(membersResult.value)
        } else {
          console.error('[ShoppingTab] getFamilyMembers failed:', membersResult.reason)
        }
      })
  }, [familyId])

  const refreshShoppingData = useCallback(() => {
    refresh()
    void refreshGroups()
  }, [refresh, refreshGroups])

  const broadcast = useRealtimeSync(
    familyId ? `family_lists_${familyId}` : null,
    refreshShoppingData
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    void refreshGroups()
  }, [refreshGroups])

  const handleCreate = async (name: string, type: ListType): Promise<boolean> => {
    if (!familyId || !user) return false

    setMutationError(null)
    const optimisticList: ShoppingListWithPreview = {
      id: crypto.randomUUID(),
      family_id: familyId,
      created_by: user.id,
      name,
      reminder_group_id: null,
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
    const previousLists = lists
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
    const previousLists = lists
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

  const handleGroupCreate = async (
    name: string,
    color: string,
    memberIds: string[]
  ): Promise<void> => {
    if (!familyId || !user) return
    setMutationError(null)
    await createReminderGroup(familyId, user.id, name, color, memberIds)
    await refreshGroups()
    broadcast()
  }

  const handleGroupSave = async (
    reminderGroupId: string,
    name: string,
    color: string,
    memberIds: string[] | null
  ): Promise<{ status: 'success' } | { status: 'partial' }> => {
    setMutationError(null)
    await updateReminderGroup(reminderGroupId, { name, color })

    if (memberIds === null || !user) {
      await refreshGroups()
      broadcast()
      return { status: 'success' }
    }

    try {
      await setReminderGroupMembers(reminderGroupId, user.id, memberIds)
      await refreshGroups()
      broadcast()
      return { status: 'success' }
    } catch (e) {
      console.error('[ShoppingTab] setReminderGroupMembers failed:', e)
      await refreshGroups()
      broadcast()
      return { status: 'partial' }
    }
  }

  const handleGroupDelete = async (reminderGroupId: string): Promise<void> => {
    setMutationError(null)
    await deleteReminderGroup(reminderGroupId)
    await refreshGroups()
    broadcast()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMutationError(null)
    const oldIndex = lists.findIndex((l) => l.id === active.id)
    const newIndex = lists.findIndex((l) => l.id === over.id)
    const reordered = arrayMove(lists, oldIndex, newIndex).map((l, i) => ({ ...l, sort_order: i }))
    updateLists(reordered)

    try {
      await reorderShoppingLists(reordered.map(({ id, sort_order }) => ({ id, sort_order })))
      broadcast()
    } catch (e) {
      console.error('[ShoppingTab] reorderShoppingLists failed:', e)
      updateLists(lists)
      setMutationError('목록 순서를 저장하지 못했어요')
    }
  }

  const buildShoppingHref = useCallback((listId?: string | null) => {
    const params = new URLSearchParams()
    params.set('tab', 'shopping')
    if (listId) {
      params.set('list', listId)
    }
    return `/calendar?${params.toString()}`
  }, [])

  const openShoppingDetail = useCallback(
    (listId: string) => {
      router.push(buildShoppingHref(listId), { scroll: false })
    },
    [buildShoppingHref, router]
  )

  const closeShoppingDetail = useCallback(() => {
    router.replace(buildShoppingHref(), { scroll: false })
  }, [buildShoppingHref, router])

  const handlePreviewItemsChange = useCallback((listId: string, items: ShoppingItem[]) => {
    updateLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? {
              ...list,
              previewItems: items
                .map(({ id, name, is_checked, sort_order }) => ({
                  id,
                  name,
                  is_checked,
                  sort_order,
                }))
                .sort((a, b) => a.sort_order - b.sort_order),
            }
          : list
      )
    )
  }, [updateLists])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  return (
    <div data-testid="shopping-tab-container" className="px-4 pt-2 pb-24 min-h-screen">
      <ShoppingListView
        lists={lists}
        fetchError={fetchError}
        mutationError={mutationError}
        groupCount={groups.length}
        sensors={sensors}
        onGroupManageClick={() => setShowGroupList(true)}
        onCreateClick={() => setShowModal(true)}
        onDelete={handleDelete}
        onRename={handleRename}
        onDragEnd={handleDragEnd}
        onOpen={openShoppingDetail}
      />

      {showModal && (
        <CreateListModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}

      {showGroupList && user && (
        <ReminderGroupListSheet
          groups={groups}
          familyMembers={familyMembers}
          currentUserId={user.id}
          onClose={() => setShowGroupList(false)}
          onCreate={handleGroupCreate}
          onSave={handleGroupSave}
          onDelete={handleGroupDelete}
        />
      )}

      {user && activeListId && (
        <ShoppingDetailView
          key={activeListId}
          listId={activeListId}
          user={user}
          onClose={closeShoppingDetail}
          onPreviewItemsChange={handlePreviewItemsChange}
        />
      )}
    </div>
  )
}

interface ShoppingListViewProps {
  lists: ShoppingListWithPreview[]
  fetchError: boolean
  mutationError: string | null
  groupCount: number
  sensors: ReturnType<typeof useSensors>
  onGroupManageClick: () => void
  onCreateClick: () => void
  onDelete: (listId: string) => void
  onRename: (listId: string, name: string) => void
  onDragEnd: (event: DragEndEvent) => void
  onOpen: (listId: string) => void
}

function ShoppingListView({
  lists,
  fetchError,
  mutationError,
  groupCount,
  sensors,
  onGroupManageClick,
  onCreateClick,
  onDelete,
  onRename,
  onDragEnd,
  onOpen,
}: ShoppingListViewProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">리마인더</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {lists.length > 0 ? `${lists.length}개의 목록` : '리마인더를 만들어보세요'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGroupManageClick}
            className="relative w-11 h-11 flex items-center justify-center rounded-full border border-stone-200 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 dark:border-stone-700 dark:text-stone-500 dark:hover:bg-stone-900 dark:hover:text-stone-300"
            aria-label="리마인더 그룹 관리"
          >
            <ListFilter size={19} />
            {groupCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-400" />
            )}
          </button>
          <button
            onClick={onCreateClick}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-accent-400 hover:bg-accent-500 text-white shadow-sm transition-colors"
            aria-label="새 리마인더 추가"
          >
            <Plus size={20} />
          </button>
        </div>
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
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ListChecks size={40} className="text-stone-300 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 font-medium">아직 리마인더가 없어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">위의 + 버튼을 눌러보세요</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={lists.map((list) => list.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {lists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  previewItems={list.previewItems}
                  onDelete={onDelete}
                  onRename={onRename}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </>
  )
}
