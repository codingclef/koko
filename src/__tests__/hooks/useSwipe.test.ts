import { renderHook } from '@testing-library/react'
import { useSwipe } from '@/hooks/useSwipe'

function makeTouchEvent(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as React.TouchEvent
}

function makeChangedTouchEvent(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] } as unknown as React.TouchEvent
}

describe('useSwipe', () => {
  it('왼쪽으로 충분히 스와이프하면 onSwipeLeft가 호출된다', () => {
    const onSwipeLeft = jest.fn()
    const onSwipeRight = jest.fn()
    const { result } = renderHook(() => useSwipe({ onSwipeLeft, onSwipeRight }))

    result.current.onTouchStart(makeTouchEvent(200, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(100, 105)) // deltaX=-100, deltaY=5

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('오른쪽으로 충분히 스와이프하면 onSwipeRight가 호출된다', () => {
    const onSwipeLeft = jest.fn()
    const onSwipeRight = jest.fn()
    const { result } = renderHook(() => useSwipe({ onSwipeLeft, onSwipeRight }))

    result.current.onTouchStart(makeTouchEvent(100, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(200, 105)) // deltaX=100, deltaY=5

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('threshold 미만의 수평 이동은 무시한다', () => {
    const onSwipeLeft = jest.fn()
    const { result } = renderHook(() => useSwipe({ onSwipeLeft, threshold: 50 }))

    result.current.onTouchStart(makeTouchEvent(100, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(60, 100)) // deltaX=-40 < 50

    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('수직 이동이 수평보다 크면 무시한다', () => {
    const onSwipeLeft = jest.fn()
    const { result } = renderHook(() => useSwipe({ onSwipeLeft }))

    result.current.onTouchStart(makeTouchEvent(200, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(80, 300)) // deltaX=-120, deltaY=200

    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('커스텀 threshold를 사용한다', () => {
    const onSwipeLeft = jest.fn()
    const { result } = renderHook(() => useSwipe({ onSwipeLeft, threshold: 100 }))

    result.current.onTouchStart(makeTouchEvent(200, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(120, 102)) // deltaX=-80 < 100

    expect(onSwipeLeft).not.toHaveBeenCalled()

    result.current.onTouchStart(makeTouchEvent(200, 100))
    result.current.onTouchEnd(makeChangedTouchEvent(90, 102)) // deltaX=-110 >= 100

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })
})
