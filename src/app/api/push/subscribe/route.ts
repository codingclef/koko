import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint, p256dh, auth, previousEndpoint } = await req.json()

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh, auth }, { onConflict: 'endpoint' })

  if (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  let cleanupPending = false
  if (typeof previousEndpoint === 'string' && previousEndpoint && previousEndpoint !== endpoint) {
    const { error: cleanupError } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', previousEndpoint)

    if (cleanupError) {
      cleanupPending = true
      console.error('[push/subscribe] previous endpoint cleanup failed:', cleanupError)
    }
  }

  return NextResponse.json({ ok: true, cleanupPending })
}
