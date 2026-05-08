'use client'

import { useState } from 'react'
import { X, ListChecks, Trash2 } from 'lucide-react'
import type { ListType } from '@/lib/shopping'

interface Props {
  onClose: () => void
  onCreate: (name: string, type: ListType) => Promise<boolean>
}

export function CreateListModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ListType>('strikethrough')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const created = await onCreate(name.trim(), type)
      if (created) {
        setName('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">새 리마인더</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-y-auto px-6 pb-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1.5">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 이마트, 코스트코"
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-300 dark:focus:ring-accent-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-2">
              체크 방식
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('strikethrough')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  type === 'strikethrough'
                    ? 'border-accent-400 bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400'
                    : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-300'
                }`}
              >
                <ListChecks size={20} />
                <span className="text-xs font-medium">취소선</span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500">체크 후 남아있음</span>
              </button>
              <button
                type="button"
                onClick={() => setType('delete')}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  type === 'delete'
                    ? 'border-accent-400 bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400'
                    : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-300'
                }`}
              >
                <Trash2 size={20} />
                <span className="text-xs font-medium">삭제</span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500">체크 즉시 사라짐</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full py-3 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:bg-stone-200 dark:disabled:bg-stone-700 text-white disabled:text-stone-400 font-semibold transition-colors"
          >
            {loading ? '만드는 중...' : '만들기'}
          </button>
        </form>
      </div>
    </div>
  )
}
