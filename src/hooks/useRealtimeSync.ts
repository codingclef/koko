import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

function sendBroadcast(channel: ReturnType<typeof supabase.channel> | null) {
  if (!channel) return
  channel.send({ type: 'broadcast', event: 'refresh', payload: {} })
    .then((result) => {
      if (result !== 'ok') {
        console.error('[useRealtimeSync] broadcast failed:', result)
      }
    })
    .catch((e) => console.error('[useRealtimeSync] broadcast error:', e))
}

export function useRealtimeSync(
  channelName: string | null,
  onRefresh: () => void,
  options?: {
    refreshOnSubscribed?: boolean
  }
): () => void {
  const refreshOnSubscribed = options?.refreshOnSubscribed ?? true
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const channelReadyRef = useRef(false)
  const pendingBroadcastRef = useRef(false)

  useEffect(() => {
    if (!channelName) return

    channelReadyRef.current = false
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'refresh' }, () => onRefreshRef.current())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true
          if (refreshOnSubscribed) {
            onRefreshRef.current()
          }
          if (pendingBroadcastRef.current) {
            pendingBroadcastRef.current = false
            sendBroadcast(channel)
          }
        }
      })
    channelRef.current = channel

    return () => {
      channelReadyRef.current = false
      channelRef.current = null
      if (pendingBroadcastRef.current) {
        pendingBroadcastRef.current = false
        sendBroadcast(channel)
      }
      supabase.removeChannel(channel)
    }
  }, [channelName, refreshOnSubscribed])

  return useCallback(() => {
    if (channelReadyRef.current) {
      sendBroadcast(channelRef.current)
    } else {
      pendingBroadcastRef.current = true
    }
  }, [])
}
