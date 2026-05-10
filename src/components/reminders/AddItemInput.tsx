'use client'

import { forwardRef, useState } from 'react'
import { Plus } from 'lucide-react'

interface Props {
  onAdd: (name: string) => Promise<boolean>
}

export const AddItemInput = forwardRef<HTMLInputElement, Props>(function AddItemInput({ onAdd }, ref) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || loading) return
    setLoading(true)
    try {
      const created = await onAdd(value.trim())
      if (created) {
        setValue('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="아이템 추가..."
        className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-300 dark:focus:ring-accent-500 transition text-base"
      />
      <button
        type="submit"
        disabled={!value.trim() || loading}
        className="p-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:bg-stone-200 dark:disabled:bg-stone-700 text-white disabled:text-stone-400 transition-colors flex-shrink-0"
        aria-label="추가"
      >
        <Plus size={20} />
      </button>
    </form>
  )
})
