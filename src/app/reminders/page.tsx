import { redirect } from 'next/navigation'

export default function RemindersPage() {
  redirect('/calendar?tab=reminders')
}
