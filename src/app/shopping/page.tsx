'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import {
  getShoppingLists,
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
  reorderShoppingLists,
} from '@/lib/shopping'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import { CreateListModal } from '@/components/shopping/CreateListModal'
import { BottomNav } from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import type { ShoppingList, ListType } from '@/lib/shopping'

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const channelReadyRef = useRef(false)
  const bcRef = useRef<BroadcastChannel | null>(null)

  const loading = authLoading || familyLoading

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  useEffect(() => {
    if (!familyId) return

    const refresh = () =>
      getShoppingLists(familyId)
        .then(setLists)
        .catch((e) => {
          console.error('[ShoppingPage] getShoppingLists failed:', e)
          setFetchError(true)
        })
    refresh()

    // 같은 브라우저 내 탭 간 즉시 동기화 (WebSocket 연결 불필요)
    const bc = new BroadcastChannel(`koko-lists-${familyId}`)
    bc.onmessage = refresh
    bcRef.current = bc

    // 다른 기기 간 동기화 (Supabase Realtime)
    const channel = supabase
      .channel(`family_lists_${familyId}`)
      .on('broadcast', { event: 'refresh' }, refresh)
      .subscribe((status) => {
        channelReadyRef.current = status === 'SUBSCRIBED'
        if (status === 'SUBSCRIBED') refresh()
      })

    channelRef.current = channel

    return () => {
      bc.close()
      channelReadyRef.current = false
      supabase.removeChannel(channel)
    }
  }, [familyId])

  const broadcast = () => {
    bcRef.current?.postMessage('refresh')
    if (channelRef.current && channelReadyRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'refresh', payload: {} })
    }
  }

  const handleCreate = async (name: string, type: ListType) => {
    if (!familyId || !user) return

    const optimisticList: ShoppingList = {
      id: crypto.randomUUID(),
      family_id: familyId,
      created_by: user.id,
      name,
      type,
      sort_order: 0,
      created_at: new Date().toISOString(),
    }
    setLists((prev) => [optimisticList, ...prev])
    setShowModal(false)

    const realList = await createShoppingList(familyId, user.id, name, type)
    setLists((prev) => prev.map((l) => l.id === optimisticList.id ? realList : l))
    broadcast()
  }

  const handleDelete = async (listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId))
    await deleteShoppingList(listId)
    broadcast()
  }

  const handleRename = async (listId: string, name: string) => {
    setLists((prev) => prev.map((l) => l.id === listId ? { ...l, name } : l))
    await renameShoppingList(listId, name)
    broadcast()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setLists((prev) => {
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">🛒 장바구니</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {lists.length > 0 ? `${lists.length}개의 목록` : '장바구니를 만들어보세요'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-semibold text-sm transition-colors shadow-sm"
        >
          <Plus size={16} />
          새 목록
        </button>
      </div>

      {fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-stone-500 dark:text-stone-400 font-medium">목록을 불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">잠시 후 다시 시도해주세요</p>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🛍️</div>
          <p className="text-stone-500 dark:text-stone-400 font-medium">아직 장바구니가 없어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">위의 새 목록 버튼을 눌러보세요</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {lists.map((list) => (
                <ShoppingListCard key={list.id} list={list} onDelete={handleDelete} onRename={handleRename} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showModal && (
        <CreateListModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
      <BottomNav />
    </div>
  )
}
