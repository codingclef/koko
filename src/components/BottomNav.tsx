'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ListChecks, Settings } from 'lucide-react'
import type { Tab } from '@/types/tabs'

const navItems = [
  { href: '/calendar', icon: CalendarDays, label: '캘린더' },
  { href: '/reminders', icon: ListChecks, label: '리마인더' },
  { href: '/settings', icon: Settings, label: '설정' },
]

interface Props {
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
}

export function BottomNav({ activeTab, onTabChange }: Props) {
  const pathname = usePathname()
  const tabMode = !!onTabChange

  return (
    <nav className="shrink-0 bg-white dark:bg-stone-950 border-t border-stone-100 dark:border-stone-800 pb-safe">
      <div className="max-w-lg mx-auto flex">
        {navItems.map(({ href, icon: Icon, label }) => {
          const tabId = href.slice(1) // '/calendar' → 'calendar'
          const active = tabMode
            ? activeTab === tabId
            : pathname.startsWith(href)
          const className = `flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
            active
              ? 'text-accent-500'
              : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
          }`
          return tabMode ? (
            <button
              key={href}
              onClick={() => onTabChange(tabId as Tab)}
              className={className}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </button>
          ) : (
            <Link key={href} href={href} className={className}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
