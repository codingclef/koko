import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAsyncDataOptions<T> {
  enabled: boolean
  initialValue: T
  load: () => Promise<T>
  reloadKey?: unknown
  onSuccess?: (value: T) => void
  onError?: (error: unknown) => void
  keepLoadingWhenDisabled?: boolean
}

export function useAsyncData<T>({
  enabled,
  initialValue,
  load,
  reloadKey,
  onSuccess,
  onError,
  keepLoadingWhenDisabled = true,
}: UseAsyncDataOptions<T>) {
  const [value, setValue] = useState<T>(initialValue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
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
      setError(null)
      setValue(nextValue)
      onSuccessRef.current?.(nextValue)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setError(error)
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
      setError(null)
      setValue(initialValueRef.current)
      setLoading(keepLoadingWhenDisabled)
      return
    }

    run()
  }, [enabled, keepLoadingWhenDisabled, reloadKey, run])

  return {
    value,
    setValue,
    loading,
    error,
    clearError: () => setError(null),
    reload: run,
  }
}
