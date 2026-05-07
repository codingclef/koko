'use client'

import { ChevronRight } from 'lucide-react'
import type { RecurrenceRule } from '@/types/recurrence'
import { buildRecurrenceLabel } from '@/types/recurrence'

interface Props {
  value: RecurrenceRule | null
  onSelect: (rule: RecurrenceRule | null) => void
  onCustomize: () => void
  customRule: RecurrenceRule | null
  onClose: () => void
  allowNone?: boolean
}

const PRESETS: Array<{ label: string; rule: RecurrenceRule | null }> = [
  { label: '안 함', rule: null },
  { label: '매일',  rule: { freq: 'daily',   interval: 1 } },
  { label: '매주',  rule: { freq: 'weekly',  interval: 1 } },
  { label: '매월',  rule: { freq: 'monthly', interval: 1 } },
  { label: '매년',  rule: { freq: 'yearly',  interval: 1 } },
]

function isSameRule(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    (a.daysOfWeek ?? []).join(',') === (b.daysOfWeek ?? []).join(',') &&
    (a.dayOfMonth ?? null) === (b.dayOfMonth ?? null) &&
    (a.endDate ?? null) === (b.endDate ?? null)
  )
}

function isCustom(rule: RecurrenceRule | null): boolean {
  if (!rule) return false
  return !PRESETS.some((p) => isSameRule(p.rule, rule))
}

export function RecurrencePickerSheet({ value, onSelect, onCustomize, customRule, onClose, allowNone = true }: Props) {
  const showCustomCheck = isCustom(value)
  const presets = allowNone ? PRESETS : PRESETS.filter((preset) => preset.rule !== null)

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="bg-white dark:bg-stone-900 rounded-t-2xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800">
          <h3 className="text-base font-bold text-stone-800 dark:text-stone-100">반복</h3>
          <button
            onClick={onClose}
            className="text-sm font-medium text-accent-400"
          >
            완료
          </button>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800 mx-4 mt-3 mb-3 rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
          {presets.map(({ label, rule }) => {
            const checked = !isCustom(value) && isSameRule(value, rule)
            return (
              <button
                key={label}
                onClick={() => onSelect(rule)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-stone-800 dark:text-stone-100"
              >
                <span>{label}</span>
                {checked && <CheckIcon />}
              </button>
            )
          })}
        </div>

        <div className="mx-4 mb-4 rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
          <button
            onClick={onCustomize}
            className="w-full flex items-center justify-between px-4 py-3.5"
          >
            <div className="text-left">
              <p className="text-sm text-stone-800 dark:text-stone-100">사용자화</p>
              {customRule && (
                <p className="text-xs text-stone-400 mt-0.5">{buildRecurrenceLabel(customRule)}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {showCustomCheck && <CheckIcon />}
              <ChevronRight size={16} className="text-stone-400" />
            </div>
          </button>
        </div>

        <p className="mx-5 mb-5 text-xs text-stone-400">
          종료일을 따로 설정하지 않으면 시작일 기준 1년 동안 반복 일정을 생성해요.
        </p>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-accent-400">
      <path d="M3.5 9.5L7 13L14.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
