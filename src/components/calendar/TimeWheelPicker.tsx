'use client'

import { useEffect, useRef } from 'react'

const ITEM_H = 44
const VISIBLE = 5

interface ColProps {
  values: string[]
  selected: number
  onSelect: (idx: number) => void
}

function WheelCol({ values, selected, onSelect }: ColProps) {
  const ref = useRef<HTMLDivElement>(null)
  const programmaticRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mountedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    programmaticRef.current = true
    if (!mountedRef.current) {
      el.scrollTop = selected * ITEM_H
      mountedRef.current = true
      programmaticRef.current = false
    } else {
      el.scrollTo({ top: selected * ITEM_H, behavior: 'smooth' })
      const t = setTimeout(() => { programmaticRef.current = false }, 350)
      return () => clearTimeout(t)
    }
  }, [selected])

  const onScroll = () => {
    if (programmaticRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const idx = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)))
      onSelect(idx)
    }, 100)
  }

  return (
    <div className="relative flex-1">
      <div
        className="pointer-events-none absolute inset-x-0 bg-accent-50 dark:bg-accent-950/30 rounded-xl z-10"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar"
        style={{
          height: ITEM_H * VISIBLE,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
        }}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {values.map((v, i) => (
          <div
            key={i}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className="flex items-center justify-center text-lg font-semibold text-stone-800 dark:text-stone-100"
          >
            {v}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  )
}

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
      <WheelCol values={HOURS} selected={hours} onSelect={(h) => onChange(h, minutes)} />
      <span className="text-2xl font-bold text-stone-300 dark:text-stone-600 shrink-0">:</span>
      <WheelCol values={MINS} selected={minutes} onSelect={(m) => onChange(hours, m)} />
    </div>
  )
}
