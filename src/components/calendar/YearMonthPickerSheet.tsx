'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WheelPickerColumn } from '@/components/calendar/WheelPickerColumn'

const FALLBACK_TOP = 80
const YEAR_COUNT = 21
const FOCUSABLE = '[tabindex="0"], button:not([disabled])'

interface Props {
  year: number
  month: number
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onConfirm: (year: number, month: number) => void
  onClose: () => void
}

export function YearMonthPickerSheet({ year, month, anchorRef, onConfirm, onClose }: Props) {
  const [pickedYear, setPickedYear] = useState(year)
  const [pickedMonth, setPickedMonth] = useState(month)

  const baseYear = year - 10
  const years = useMemo(
    () => Array.from({ length: YEAR_COUNT }, (_, i) => `${baseYear + i}년`),
    [baseYear]
  )
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
    []
  )

  const yearIdx = pickedYear - baseYear
  const monthIdx = pickedMonth

  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!panelRef.current) return
    const bottom = anchorRef.current?.getBoundingClientRect().bottom ?? FALLBACK_TOP
    panelRef.current.style.top = `${bottom + 8}px`
  }, [anchorRef])

  // 열릴 때 연도 컬럼(첫 번째 포커스 대상)으로 포커스, 닫힐 때 트리거로 복원
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => { prev?.focus() }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Tab 포커스 트랩: 패널 안에서만 순환
  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] bg-black/50"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="연월 선택"
        onKeyDown={handlePanelKeyDown}
        className="fixed left-4 right-4 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-xl"
        style={{ top: FALLBACK_TOP }}
      >
        <div className="flex">
          <WheelPickerColumn
            values={years}
            selected={yearIdx}
            onSelect={(idx) => setPickedYear(baseYear + idx)}
            label="연도"
          />
          <div aria-hidden="true" className="w-px self-stretch bg-stone-200 dark:bg-stone-700" />
          <WheelPickerColumn
            values={months}
            selected={monthIdx}
            onSelect={(idx) => setPickedMonth(idx)}
            label="월"
          />
        </div>
        <div className="px-4 pb-4 pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(pickedYear, pickedMonth)}
            className="ml-2 px-5 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
