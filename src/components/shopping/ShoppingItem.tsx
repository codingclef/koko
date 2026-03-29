'use client'

import { Trash2 } from 'lucide-react'
import type { ShoppingItem as ShoppingItemType } from '@/lib/shopping'

interface Props {
  item: ShoppingItemType
  listType: 'strikethrough' | 'delete'
  onCheck: (itemId: string, checked: boolean) => void
  onDelete: (itemId: string) => void
}

export function ShoppingItem({ item, listType, onCheck, onDelete }: Props) {
  const handleCheck = () => {
    onCheck(item.id, !item.is_checked)
  }

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        item.is_checked && listType === 'strikethrough'
          ? 'opacity-60'
          : 'opacity-100'
      }`}
    >
      <button
        onClick={handleCheck}
        aria-label={item.is_checked ? '체크 해제' : '체크'}
        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          item.is_checked
            ? 'bg-orange-400 border-orange-400'
            : 'border-stone-300 dark:border-stone-600 hover:border-orange-300'
        }`}
      >
        {item.is_checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <span
        className={`flex-1 text-stone-800 dark:text-stone-100 transition-all ${
          item.is_checked && listType === 'strikethrough'
            ? 'line-through text-stone-400 dark:text-stone-500'
            : ''
        }`}
      >
        {item.name}
      </span>

      <button
        onClick={() => onDelete(item.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
        aria-label="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
