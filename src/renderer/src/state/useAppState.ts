import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bridge } from '../../../shared/model'
import type { ViewState } from '../../../shared/sync'
import { StateReplica } from './replica'

/** One outstanding request; notification bursts cannot flood IPC or starve the next refresh. */
export function useAppState(api: Bridge, onError: (message: string) => void) {
  const [data, setData] = useState<ViewState | null>(null)
  const [replica] = useState(() => new StateReplica())
  const error = useRef(onError)
  error.current = onError
  const inFlight = useRef<Promise<void> | null>(null)
  const pending = useRef(false)

  const refresh = useCallback((): Promise<void> => {
    pending.current = true
    if (inFlight.current) return inFlight.current
    const request = async () => {
      while (pending.current) {
        pending.current = false
        const result = await api.syncState(replica.cursor)
        if (!result.ok) {
          error.current(result.error)
          return
        }
        try {
          setData(replica.apply(result.value))
        } catch (failure) {
          if (!replica.cursor) throw failure
          replica.reset()
          pending.current = true
        }
      }
    }
    inFlight.current = request()
      .catch((failure) => {
        error.current(
          failure instanceof Error ? failure.message : 'Не удалось обновить состояние приложения.',
        )
      })
      .finally(() => {
        inFlight.current = null
      })
    return inFlight.current
  }, [api, replica])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    void refresh()
    const unsubscribe = api.onChange(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        void refresh()
      }, 24)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [api, refresh])

  const readState = useCallback(() => replica.state, [replica])
  return { data, refresh, readState }
}
