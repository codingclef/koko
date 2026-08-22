export function loadReminderTab() {
  return import('@/components/tabs/ReminderTab').then((mod) => mod.ReminderTab)
}

export function loadSettingsTab() {
  return import('@/components/tabs/SettingsTab').then((mod) => mod.SettingsTab)
}
