export const ALLOWED_LABEL_COLORS = new Set([
  '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6',
  '#ef4444', '#eab308', '#10b981', '#06b6d4', '#f59e0b', '#6b7280',
])

export const LABEL_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
  '#eab308', // yellow
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#6b7280', // gray
]

export const LABEL_COLOR_NAMES: Record<string, string> = {
  '#f97316': '주황색',
  '#3b82f6': '파란색',
  '#22c55e': '초록색',
  '#a855f7': '보라색',
  '#ec4899': '분홍색',
  '#14b8a6': '청록색',
  '#ef4444': '빨간색',
  '#eab308': '노란색',
  '#10b981': '에메랄드',
  '#06b6d4': '하늘색',
  '#f59e0b': '호박색',
  '#6b7280': '회색',
}

// Stored hex values are identifiers; display uses desaturated variants for calm UI.
const COLOR_DISPLAY_MAP: Record<string, string> = {
  '#f97316': '#e89454', // orange → muted warm orange
  '#3b82f6': '#6ba5f0', // blue → soft blue
  '#22c55e': '#4db87c', // green → sage green
  '#a855f7': '#b47de0', // purple → soft lavender
  '#ec4899': '#e46daa', // pink → soft rose
  '#14b8a6': '#2eb5a8', // teal → muted teal
  '#ef4444': '#e06464', // red → soft red
  '#eab308': '#c8a028', // yellow → muted amber
  '#10b981': '#30b87c', // emerald → muted emerald
  '#06b6d4': '#28b6d2', // cyan → soft cyan
  '#f59e0b': '#c89028', // amber → warm amber
  '#6b7280': '#848a96', // gray → lighter gray
}

export function toDisplayColor(color: string): string {
  return COLOR_DISPLAY_MAP[color] ?? color
}
