'use client'

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'

export const WHEEL_ITEM_H = 44
const VISIBLE = 5

interface Props {
  values: string[]
  selected: number
  onSelect: (idx: number) => void
  label?: string
  selectionRef?: Ref<() => number>
}

export function WheelPickerColumn({ values, selected, onSelect, label, selectionRef }: Props) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const programmaticRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mountedRef = useRef(false)

  const readScrollIndex = () => {
    const top = ref.current?.scrollTop ?? selected * WHEEL_ITEM_H
    return Math.min(values.length - 1, Math.max(0, Math.round(top / WHEEL_ITEM_H)))
  }

  useImperativeHandle(selectionRef, () => readScrollIndex)

  // Confirmation reads the visible position, so keyboard changes must be reflected before paint.
  useLayoutEffect(() => {
    if (selectionRef && ref.current) ref.current.scrollTop = selected * WHEEL_ITEM_H
  }, [selected, selectionRef])

  useEffect(() => {
    const el = ref.current
    if (!el || selectionRef) return
    programmaticRef.current = true
    if (!mountedRef.current) {
      el.scrollTop = selected * WHEEL_ITEM_H
      mountedRef.current = true
      programmaticRef.current = false
    } else {
      el.scrollTo({ top: selected * WHEEL_ITEM_H, behavior: 'smooth' })
      const t = setTimeout(() => { programmaticRef.current = false }, 350)
      return () => clearTimeout(t)
    }
  }, [selected, selectionRef])

  // timerRef cleanup on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const onScroll = () => {
    if (programmaticRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      if (ref.current) onSelect(readScrollIndex())
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onSelect(Math.min(values.length - 1, selected + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      onSelect(Math.max(0, selected - 1))
    }
  }

  const activeId = `${id}-option-${selected}`

  return (
    <div className="relative flex-1">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-0 rounded-xl bg-accent-50 dark:bg-accent-950/30"
        style={{ top: WHEEL_ITEM_H * 2, height: WHEEL_ITEM_H }}
      />
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        aria-activedescendant={activeId}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={handleKeyDown}
        className="no-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
        style={{
          height: WHEEL_ITEM_H * VISIBLE,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
        }}
      >
        <div aria-hidden="true" style={{ height: WHEEL_ITEM_H * 2 }} />
        {values.map((v, i) => (
          <div
            key={i}
            id={`${id}-option-${i}`}
            role="option"
            aria-selected={i === selected}
            style={{ height: WHEEL_ITEM_H, scrollSnapAlign: 'center' }}
            className="relative z-10 flex items-center justify-center text-lg font-semibold text-stone-800 dark:text-stone-100"
          >
            {v}
          </div>
        ))}
        <div aria-hidden="true" style={{ height: WHEEL_ITEM_H * 2 }} />
      </div>
    </div>
  )
}
