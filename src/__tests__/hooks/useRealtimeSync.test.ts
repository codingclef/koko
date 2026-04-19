import { renderHook, act } from '@testing-library/react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

const mockSend = jest.fn().mockResolvedValue('ok')
const mockRemoveChannel = jest.fn()
let subscribeCb: ((status: string) => void) | undefined
let broadcastCb: (() => void) | undefined

const mockChannel = {
  on: jest.fn(),
  subscribe: jest.fn(),
  send: mockSend,
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
const mockSupabaseChannel = supabase.channel as jest.Mock
const mockSupabaseRemoveChannel = supabase.removeChannel as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  subscribeCb = undefined
  broadcastCb = undefined

  mockChannel.on.mockImplementation((_type: string, _filter: unknown, cb: () => void) => {
    broadcastCb = cb
    return mockChannel
  })
  mockChannel.subscribe.mockImplementation((cb: (status: string) => void) => {
    subscribeCb = cb
    return mockChannel
  })

  mockSupabaseChannel.mockReturnValue(mockChannel)
  mockSupabaseRemoveChannel.mockImplementation(mockRemoveChannel)
})

describe('useRealtimeSync', () => {
  it('channelName이 null이면 채널을 구독하지 않는다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync(null, onRefresh))
    expect(mockSupabaseChannel).not.toHaveBeenCalled()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('channelName이 주어지면 채널을 구독한다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh))
    expect(mockSupabaseChannel).toHaveBeenCalledWith('test-channel')
    expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'refresh' }, expect.any(Function))
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('SUBSCRIBED 상태가 되면 onRefresh를 호출한다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { subscribeCb?.('SUBSCRIBED') })

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('refreshOnSubscribed=false이면 SUBSCRIBED 상태에서 onRefresh를 호출하지 않는다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh, { refreshOnSubscribed: false }))

    act(() => { subscribeCb?.('SUBSCRIBED') })

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('SUBSCRIBED 아닌 상태에서는 onRefresh를 호출하지 않는다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { subscribeCb?.('CONNECTING') })

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('broadcast 이벤트를 수신하면 onRefresh를 호출한다', () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { broadcastCb?.() })

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('SUBSCRIBED 전에는 broadcast()를 전송하지 않는다', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { result.current() })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('SUBSCRIBED 후 broadcast()를 호출하면 채널로 전송한다', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { subscribeCb?.('SUBSCRIBED') })
    act(() => { result.current() })

    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'refresh',
      payload: {},
    })
  })

  it('SUBSCRIBED 전 broadcast() 호출 시 전송하지 않고 pending으로 예약한다', () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { result.current() })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('pending broadcast가 있을 때 SUBSCRIBED가 되면 1회 flush한다', async () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { result.current() })
    expect(mockSend).not.toHaveBeenCalled()

    await act(async () => { subscribeCb?.('SUBSCRIBED') })

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith({ type: 'broadcast', event: 'refresh', payload: {} })
  })

  it('SUBSCRIBED 전 broadcast()를 여러 번 호출해도 flush는 1회만 한다', async () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => {
      result.current()
      result.current()
      result.current()
    })

    await act(async () => { subscribeCb?.('SUBSCRIBED') })

    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('pending이 없으면 SUBSCRIBED 시 flush하지 않는다', async () => {
    const onRefresh = jest.fn()
    renderHook(() => useRealtimeSync('test-channel', onRefresh))

    await act(async () => { subscribeCb?.('SUBSCRIBED') })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('flush 후 두 번째 SUBSCRIBED에서 재flush하지 않는다', async () => {
    const onRefresh = jest.fn()
    const { result } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    act(() => { result.current() })
    await act(async () => { subscribeCb?.('SUBSCRIBED') })
    expect(mockSend).toHaveBeenCalledTimes(1)

    await act(async () => { subscribeCb?.('SUBSCRIBED') })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('언마운트 시 채널을 제거한다', () => {
    const onRefresh = jest.fn()
    const { unmount } = renderHook(() => useRealtimeSync('test-channel', onRefresh))

    unmount()

    expect(mockSupabaseRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('channelName 변경 시 이전 채널을 제거하고 새 채널을 구독한다', () => {
    const onRefresh = jest.fn()
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useRealtimeSync(name, onRefresh),
      { initialProps: { name: 'channel-a' } }
    )

    expect(mockSupabaseChannel).toHaveBeenCalledWith('channel-a')

    rerender({ name: 'channel-b' })

    expect(mockSupabaseRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockSupabaseChannel).toHaveBeenCalledWith('channel-b')
  })

  it('onRefresh가 변경되어도 채널을 재구독하지 않는다', () => {
    const onRefresh1 = jest.fn()
    const onRefresh2 = jest.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useRealtimeSync('fixed-channel', cb),
      { initialProps: { cb: onRefresh1 } }
    )

    rerender({ cb: onRefresh2 })

    // 채널 재구독 없이 1번만 생성
    expect(mockSupabaseChannel).toHaveBeenCalledTimes(1)

    // 최신 콜백(onRefresh2)이 broadcast 수신에 사용된다
    act(() => { broadcastCb?.() })
    expect(onRefresh2).toHaveBeenCalledTimes(1)
    expect(onRefresh1).not.toHaveBeenCalled()
  })
})
