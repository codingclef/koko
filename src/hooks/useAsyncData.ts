import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAsyncDataOptions<T> {
  enabled: boolean
  initialValue: T
  load: () => Promise<T>
  onSuccess?: (value: T) => void
  onError?: (error: unknown) => void
  keepLoadingWhenDisabled?: boolean
}

export function useAsyncData<T>({
  enabled,
  initialValue,
  load,
  onSuccess,
  onError,
  keepLoadingWhenDisabled = true,
}: UseAsyncDataOptions<T>) {
  const [value, setValue] = useState<T>(initialValue)
  const [loading, setLoading] = useState(true)
  const requestIdRef = useRef(0)
  const initialValueRef = useRef(initialValue)
  const loadRef = useRef(load)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  initialValueRef.current = initialValue
  loadRef.current = load
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError

  const run = useCallback(async () => {
    if (!enabled) return

    const requestId = ++requestIdRef.current
    setLoading(true)

    try {
      const nextValue = await loadRef.current()
      if (requestId !== requestIdRef.current) return
      setValue(nextValue)
      onSuccessRef.current?.(nextValue)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setValue(initialValueRef.current)
      onErrorRef.current?.(error)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1
      setValue(initialValueRef.current)
      setLoading(keepLoadingWhenDisabled)
      return
    }

    run()
  }, [enabled, keepLoadingWhenDisabled, run])

  return {
    value,
    setValue,
    loading,
    reload: run,
  }
}
