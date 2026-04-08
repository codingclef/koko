'use client'

import { WheelPickerColumn } from '@/components/calendar/WheelPickerColumn'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface Props {
  hours: number
  minutes: number
  onChange: (hours: number, minutes: number) => void
}

export function TimeWheelPicker({ hours, minutes, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 px-6 py-1 bg-white dark:bg-stone-900">
      <WheelPickerColumn values={HOURS} selected={hours} onSelect={(h) => onChange(h, minutes)} />
      <span className="text-2xl font-bold text-stone-300 dark:text-stone-600 shrink-0">:</span>
      <WheelPickerColumn values={MINS} selected={minutes} onSelect={(m) => onChange(hours, m)} />
    </div>
  )
}
