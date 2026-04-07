import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Supabase Realtime broadcast 구독을 관리하는 훅.
 * - channelName이 null이면 구독하지 않는다.
 * - 기본적으로 SUBSCRIBED 시점과 broadcast 수신 시 onRefresh를 호출한다.
 * - broadcast()는 채널이 SUBSCRIBED 상태일 때만 전송한다 (PATTERNS.md 참조).
 */
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
        }
      })
    channelRef.current = channel

    return () => {
      channelReadyRef.current = false
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [channelName, refreshOnSubscribed])

  return useCallback(() => {
    if (channelReadyRef.current) {
      channelRef.current?.send({ type: 'broadcast', event: 'refresh', payload: {} })
    }
  }, [])
}
