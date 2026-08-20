import { clearIdleWorkQueue, scheduleIdleWork } from '@/lib/idle-work'

type IdleWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const idleWindow = window as unknown as IdleWindow
const originalRequestIdleCallback = idleWindow.requestIdleCallback
const originalCancelIdleCallback = idleWindow.cancelIdleCallback
const originalRequestAnimationFrame = window.requestAnimationFrame
const originalCancelAnimationFrame = window.cancelAnimationFrame

beforeEach(() => {
  jest.useFakeTimers()
  clearIdleWorkQueue()
  delete idleWindow.requestIdleCallback
  delete idleWindow.cancelIdleCallback
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 16)
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle)
})

afterEach(() => {
  clearIdleWorkQueue()
  jest.useRealTimers()
  idleWindow.requestIdleCallback = originalRequestIdleCallback
  idleWindow.cancelIdleCallback = originalCancelIdleCallback
  window.requestAnimationFrame = originalRequestAnimationFrame
  window.cancelAnimationFrame = originalCancelAnimationFrame
})

describe('scheduleIdleWork', () => {
  it('fallback에서는 우선순위 순서로 한 번에 하나씩 실행한다', () => {
    const order: string[] = []
    scheduleIdleWork(() => order.push('low'), 'low')
    scheduleIdleWork(() => order.push('normal'), 'normal')
    scheduleIdleWork(() => order.push('high'), 'high')

    jest.advanceTimersByTime(800)
    expect(order).toEqual(['high'])

    jest.advanceTimersByTime(1000)
    expect(order).toEqual(['high', 'normal'])

    jest.advanceTimersByTime(1300)
    expect(order).toEqual(['high', 'normal', 'low'])
  })

  it('취소된 작업은 실행하지 않는다', () => {
    const callback = jest.fn()
    const cancel = scheduleIdleWork(callback, 'high')

    cancel()
    jest.runAllTimers()

    expect(callback).not.toHaveBeenCalled()
  })

  it('requestIdleCallback 환경에서도 idle slot 하나당 작업 하나만 실행한다', () => {
    const idleCallbacks: Array<() => void> = []
    idleWindow.requestIdleCallback = jest.fn((callback: () => void) => {
      idleCallbacks.push(callback)
      return idleCallbacks.length
    })
    idleWindow.cancelIdleCallback = jest.fn()
    const first = jest.fn()
    const second = jest.fn()

    scheduleIdleWork(first, 'normal')
    scheduleIdleWork(second, 'normal')
    expect(idleCallbacks).toHaveLength(1)

    idleCallbacks.shift()?.()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(idleCallbacks).toHaveLength(1)

    idleCallbacks.shift()?.()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
