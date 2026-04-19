'use client'

import { useRef } from 'react'
import { Plus } from 'lucide-react'
import type { Calendar } from '@/lib/calendar'
import { toDisplayColor } from '@/lib/label-colors'

const LONG_PRESS_MS = 500

interface Props {
  calendars: Calendar[]
  activeIds: Set<string>
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (calendar: Calendar) => void
}

export function CalendarFilter({ calendars, activeIds, onToggle, onAdd, onEdit }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)

  const startPress = (cal: Calendar) => {
    didLongPressRef.current = false
    timerRef.current = setTimeout(() => {
      didLongPressRef.current = true
      onEdit(cal)
    }, LONG_PRESS_MS)
  }

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  const handleClick = (cal: Calendar) => {
    if (didLongPressRef.current) return
    onToggle(cal.id)
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {calendars.map((cal) => {
        const active = activeIds.size === 0 || activeIds.has(cal.id)
        return (
          <button
            key={cal.id}
            onMouseDown={() => startPress(cal)}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={() => startPress(cal)}
            onTouchEnd={cancelPress}
            onTouchCancel={cancelPress}
            onClick={() => handleClick(cal)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              active
                ? 'text-white border-transparent'
                : 'bg-transparent text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700'
            }`}
            style={active ? { backgroundColor: toDisplayColor(cal.color), borderColor: toDisplayColor(cal.color) } : {}}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : toDisplayColor(cal.color) }}
            />
            {cal.name}
          </button>
        )
      })}
      <button
        onClick={onAdd}
        className="flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-stone-300 dark:border-stone-600 text-stone-400 shrink-0"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
