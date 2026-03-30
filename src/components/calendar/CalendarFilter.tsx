'use client'

import { Plus } from 'lucide-react'
import type { Calendar } from '@/lib/calendar'

interface Props {
  calendars: Calendar[]
  activeIds: Set<string>
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (calendar: Calendar) => void
}

export function CalendarFilter({ calendars, activeIds, onToggle, onAdd, onEdit }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {calendars.map((cal) => {
        const active = activeIds.has(cal.id)
        return (
          <button
            key={cal.id}
            onClick={() => onToggle(cal.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              active
                ? 'text-white border-transparent'
                : 'bg-transparent text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700'
            }`}
            style={active ? { backgroundColor: cal.color, borderColor: cal.color } : {}}
            onContextMenu={(e) => { e.preventDefault(); onEdit(cal) }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : cal.color }}
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
