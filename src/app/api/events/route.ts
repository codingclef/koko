import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId, assertCalendarWriteAccess } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'

interface CreateEventRequest {
  calendarId: string | null
  title: string
  description: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
  reminderMinutes: number[]
}

export async function POST(req: NextRequest) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as CreateEventRequest
  const { calendarId, title, description, startAt, endAt, isAllDay, reminderMinutes } = body

  if (!title || !startAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: member } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Family not found' }, { status: 403 })
  }

  if (calendarId) {
    const hasAccess = await assertCalendarWriteAccess(member.family_id, calendarId, actorUserId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: events, error: rpcError } = await supabaseAdmin.rpc(
    'create_event_with_reminders',
    {
      p_family_id: member.family_id,
      p_created_by: actorUserId,
      p_calendar_id: calendarId,
      p_title: title,
      p_description: description,
      p_start_at: startAt,
      p_end_at: endAt,
      p_is_all_day: isAllDay,
      p_reminder_minutes: reminderMinutes,
    }
  )

  if (rpcError || !events?.length) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  after(async () => {
    await sendEventNotification({
      familyId: member.family_id,
      calendarId,
      actorUserId,
      action: 'created',
      eventTitle: title,
      eventStartAt: startAt,
    })
  })

  return NextResponse.json(events[0], { status: 201 })
}
