'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2, CheckSquare } from 'lucide-react'
import type { ShoppingList } from '@/lib/shopping'

interface Props {
  list: ShoppingList
  onDelete: (listId: string) => void
}

export function ShoppingListCard({ list, onDelete }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(true)
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(list.id)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(false)
  }

  return (
    <div
      onClick={() => !confirming && router.push(`/shopping/${list.id}`)}
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

      {confirming ? (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-stone-500 dark:text-stone-400">삭제할까요?</span>
          <button
            onClick={handleConfirm}
            className="px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
            aria-label="삭제 확인"
          >
            삭제
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 text-xs font-semibold transition-colors"
            aria-label="취소"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={handleDeleteClick}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
          aria-label="삭제"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}
