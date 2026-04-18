'use client'

import type { RecurrenceScope } from '@/types/recurrence'

interface Props {
  mode: 'edit' | 'delete'
  onSelect: (scope: RecurrenceScope) => void
  onClose: () => void
}

export function RecurrenceScopeSheet({ mode, onSelect, onClose }: Props) {
  const options: Array<{ scope: RecurrenceScope; label: string }> = [
    { scope: 'single',    label: '이 일정만' },
    { scope: 'following', label: '이후 모든 일정' },
    { scope: 'all',       label: '모든 반복 일정' },
  ]

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="bg-white dark:bg-stone-900 rounded-t-2xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
            {mode === 'edit' ? '반복 일정 편집' : '반복 일정 삭제'}
          </p>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800 mx-4 mb-4 mt-2 rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
          {options.map(({ scope, label }) => (
            <button
              key={scope}
              onClick={() => onSelect(scope)}
              className={`w-full px-4 py-3.5 text-sm text-left font-medium ${
                mode === 'delete' && scope !== 'single'
                  ? 'text-red-500'
                  : 'text-stone-800 dark:text-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mx-4 mb-4 rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
          <button
            onClick={onClose}
            className="w-full px-4 py-3.5 text-sm font-semibold text-stone-500 dark:text-stone-400"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
