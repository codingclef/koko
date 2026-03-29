'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { getShoppingLists, createShoppingList, deleteShoppingList } from '@/lib/shopping'
import { ShoppingListCard } from '@/components/shopping/ShoppingListCard'
import { CreateListModal } from '@/components/shopping/CreateListModal'
import { supabase } from '@/lib/supabase'
import type { ShoppingList, ListType } from '@/lib/shopping'

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [showModal, setShowModal] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loading = authLoading || familyLoading

  useEffect(() => {
    if (!familyId) return

    getShoppingLists(familyId).then(setLists)

    const channel = supabase
      .channel(`family_lists_${familyId}`)
      .on('broadcast', { event: 'refresh' }, () => {
        getShoppingLists(familyId).then(setLists)
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [familyId])

  const broadcast = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
  }

  const handleCreate = async (name: string, type: ListType) => {
    if (!familyId || !user) return

    const optimisticList: ShoppingList = {
      id: crypto.randomUUID(),
      family_id: familyId,
      created_by: user.id,
      name,
      type,
      created_at: new Date().toISOString(),
    }
    setLists((prev) => [optimisticList, ...prev])
    setShowModal(false)

    await createShoppingList(familyId, user.id, name, type)
    broadcast()
  }

  const handleDelete = async (listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId))
    await deleteShoppingList(listId)
    broadcast()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 min-h-screen">
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

      {lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🛍️</div>
          <p className="text-stone-500 dark:text-stone-400 font-medium">아직 장바구니가 없어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">위의 새 목록 버튼을 눌러보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <ShoppingListCard key={list.id} list={list} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateListModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
