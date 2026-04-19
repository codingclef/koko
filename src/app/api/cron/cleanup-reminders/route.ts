import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const DEFAULT_RETENTION_DAYS = 30

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let retentionDays = DEFAULT_RETENTION_DAYS

  try {
    const body = (await req.json()) as { retentionDays?: unknown }
    if (body.retentionDays !== undefined) {
      const requestedRetentionDays = body.retentionDays
      if (
        typeof requestedRetentionDays !== 'number' ||
        !Number.isInteger(requestedRetentionDays) ||
        requestedRetentionDays < 0
      ) {
        return NextResponse.json({ error: 'Invalid retentionDays' }, { status: 400 })
      }
      retentionDays = requestedRetentionDays
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: deletedCount, error } = await supabaseAdmin.rpc(
    'cleanup_sent_event_reminders',
    { p_retention_days: retentionDays }
  )

  if (error) {
    console.error('[cleanup-reminders] rpc error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }

  return NextResponse.json({
    deleted: deletedCount ?? 0,
    retentionDays,
  })
}
