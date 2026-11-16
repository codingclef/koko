'use client'

import { useEffect, useRef, useState } from 'react'
import {
  REMINDER_UNITS, formatReminderOffset, getReminderChoice,
  isReminderAmountAllowed, type ReminderUnit,
} from '@/lib/event-reminder-options'
import { getReminderTriggerAt, REMINDER_DATE_FORMAT } from '@/lib/reminders'
import { WheelPickerColumn } from './WheelPickerColumn'

const amountsByUnit = Object.fromEntries(REMINDER_UNITS.map((unit) => [
  unit.key,
  Array.from({ length: (unit.max - unit.min) / unit.step + 1 }, (_, index) =>
    String(unit.min + index * unit.step)
  ),
]))

export function EventReminderPicker({
  allDay, offset, startAt, onApply, onCancel,
}: {
  allDay: boolean
  offset: number | null
  startAt: string | null
  onApply: (offset: number) => void
  onCancel: () => void
}) {
  const units = allDay ? REMINDER_UNITS.slice(2) : REMINDER_UNITS
  const [choice, setChoice] = useState(() => {
    const existing = getReminderChoice(offset ?? (allDay ? 1440 : 10))
    return existing && units.some((unit) => unit.key === existing.unit.key)
      ? existing
      : { unit: units[0], amount: units[0].min }
  })
  const unitSelection = useRef<() => number>(null)
  const amountSelection = useRef<() => number>(null)
  const editor = useRef<HTMLDivElement>(null)
  const unitIndex = units.findIndex((unit) => unit.key === choice.unit.key)
  const selectedOffset = choice.amount * choice.unit.multiplier

  useEffect(() => {
    const trigger = document.activeElement
    editor.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true })
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  function changeUnit(unit: ReminderUnit, amount: number) {
    return { unit, amount: isReminderAmountAllowed(amount, unit) ? amount : unit.min }
  }

  function applySelection() {
    const unit = units[unitSelection.current?.() ?? unitIndex]
    const amountIndex = amountSelection.current?.()
    const amount = amountIndex === undefined
      ? choice.amount
      : Number(amountsByUnit[choice.unit.key][amountIndex])
    const selected = changeUnit(unit, amount)
    onApply(selected.amount * selected.unit.multiplier)
  }

  return (
    <div
      ref={editor}
      className="mt-3 rounded-2xl bg-stone-100 p-3 dark:bg-stone-900"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="flex gap-2">
        <WheelPickerColumn
          key={choice.unit.key}
          label="알람 숫자"
          values={amountsByUnit[choice.unit.key]}
          selected={(choice.amount - choice.unit.min) / choice.unit.step}
          onSelect={(index) => setChoice((current) => current.unit.key === choice.unit.key
            ? { ...current, amount: Number(amountsByUnit[choice.unit.key][index]) }
            : current)}
          selectionRef={amountSelection}
        />
        <WheelPickerColumn
          label="알람 단위"
          values={units.map((unit) => unit.label)}
          selected={unitIndex}
          onSelect={(index) => {
            const currentIndex = amountSelection.current?.()
            const amount = currentIndex === undefined ? choice.amount : Number(amountsByUnit[choice.unit.key][currentIndex])
            setChoice(changeUnit(units[index], amount))
          }}
          selectionRef={unitSelection}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-stone-700 dark:text-stone-200" aria-live="polite">
          {formatReminderOffset(selectedOffset)}
          {startAt && (allDay || selectedOffset < 0) && (
            <span className="block text-xs font-normal text-stone-600 dark:text-stone-400">
              {REMINDER_DATE_FORMAT.format(new Date(getReminderTriggerAt(startAt, allDay, selectedOffset)))}
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-stone-600 dark:text-stone-300">
            취소
          </button>
          <button type="button" onClick={applySelection} className="min-h-11 rounded-xl bg-accent-600 px-3 text-sm font-semibold text-white">
            {offset === null ? '추가' : '변경'}
          </button>
        </div>
      </div>
    </div>
  )
}
