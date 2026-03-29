'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  getShoppingItems,
  addShoppingItem,
  checkShoppingItem,
  deleteShoppingItem,
} from '@/lib/shopping'
import { ShoppingItem } from '@/components/shopping/ShoppingItem'
import { AddItemInput } from '@/components/shopping/AddItemInput'
import { supabase } from '@/lib/supabase'
import type { ShoppingItem as ShoppingItemType, ShoppingList } from '@/lib/shopping'

export default function ShoppingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ShoppingItemType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const init = async () => {
      const { data } = await supabase.from('shopping_lists').select('*').eq('id', id).single()
      setList(data)
      const fetchedItems = await getShoppingItems(id)
      setItems(fetchedItems)
      setLoading(false)
    }
    init()

    const channel = supabase
      .channel(`shopping_items_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${id}` }, () => {
        getShoppingItems(id).then(setItems)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  const handleAdd = async (name: string) => {
    if (!user) return
    await addShoppingItem(id, user.id, name)
  }

  const handleCheck = async (itemId: string, checked: boolean) => {
    if (!user) return
    if (list?.type === 'delete' && checked) {
      await deleteShoppingItem(itemId)
    } else {
      await checkShoppingItem(itemId, user.id, checked)
    }
  }

  const handleDelete = async (itemId: string) => {
    await deleteShoppingItem(itemId)
  }

  const uncheckedItems = items.filter((i) => !i.is_checked)
  const checkedItems = items.filter((i) => i.is_checked)

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">
            🛒 {list?.name ?? '장바구니'}
          </h1>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            {uncheckedItems.length > 0
              ? `${uncheckedItems.length}개 남음`
              : items.length > 0
              ? '모두 완료 🎉'
              : '아이템을 추가해보세요'}
          </p>
        </div>
      </div>

      {/* 아이템 목록 */}
      <div className="flex-1 overflow-y-auto py-2">
        {uncheckedItems.length === 0 && checkedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-stone-500 dark:text-stone-400 font-medium">아직 아이템이 없어요</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">아래 입력창에 추가해보세요</p>
          </div>
        )}

        {uncheckedItems.map((item) => (
          <ShoppingItem
            key={item.id}
            item={item}
            listType={list?.type as 'strikethrough' | 'delete' ?? 'strikethrough'}
            onCheck={handleCheck}
            onDelete={handleDelete}
          />
        ))}

        {list?.type === 'strikethrough' && checkedItems.length > 0 && (
          <>
            <div className="px-4 py-2 mt-2">
              <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide">
                완료 ({checkedItems.length})
              </p>
            </div>
            {checkedItems.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                listType="strikethrough"
                onCheck={handleCheck}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </div>

      {/* 하단 입력창 */}
      <div className="border-t border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-950 pb-safe">
        <AddItemInput onAdd={handleAdd} />
      </div>
    </div>
  )
}
