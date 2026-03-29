'use client'

import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2, CheckSquare } from 'lucide-react'
import type { ShoppingList } from '@/lib/shopping'

interface Props {
  list: ShoppingList
  onDelete: (listId: string) => void
}

export function ShoppingListCard({ list, onDelete }: Props) {
  const router = useRouter()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(list.id)
  }

  return (
    <div
      onClick={() => router.push(`/shopping/${list.id}`)}
      className="group flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900 active:scale-[0.98] transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-400">
          <ShoppingCart size={20} />
        </div>
        <div>
          <p className="font-semibold text-stone-800 dark:text-stone-100">{list.name}</p>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 flex items-center gap-1">
            {list.type === 'strikethrough' ? (
              <>
                <CheckSquare size={10} />
                취소선 방식
              </>
            ) : (
              <>
                <Trash2 size={10} />
                삭제 방식
              </>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
        aria-label="삭제"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
