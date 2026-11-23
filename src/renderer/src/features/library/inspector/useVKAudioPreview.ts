import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackRow } from '../../../../../shared/types'
import { api } from '../../../state/api'

const DEFAULT_PROGRESS = 'Ищем запись в «Моей музыке» VK…'

export function useVKAudioPreview(row: TrackRow, onBeforePlay?: () => void) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(DEFAULT_PROGRESS)
  const requestId = useRef(0)
  const activeRef = useRef(false)
  const beforePlayRef = useRef(onBeforePlay)
  beforePlayRef.current = onBeforePlay

  useEffect(() => api.onVKAudioProgress(setProgress), [])

  useEffect(() => {
    setPlaying(false)
    setLoading(false)
    setError(null)
    return () => {
      ++requestId.current
      if (activeRef.current) {
        activeRef.current = false
        void api.pauseVKTrack()
      }
    }
  }, [row.id])

  const stop = useCallback(async () => {
    ++requestId.current
    if (!activeRef.current) return
    activeRef.current = false
    setLoading(false)
    setPlaying(false)
    try {
      await api.pauseVKTrack()
    } catch {
      /* Ignore pause errors during reset or cancellation. */
    }
  }, [])

  const toggle = useCallback(async () => {
    beforePlayRef.current?.()
    if (playing || loading) {
      await stop()
      return
    }
    const currentRequest = ++requestId.current
    activeRef.current = true
    setLoading(true)
    setProgress(DEFAULT_PROGRESS)
    setError(null)
    try {
      const res = await api.playVKTrack({
        id: row.source.id,
        artist: row.source.artist,
        title: row.source.title,
        duration: row.source.duration,
        position: row.position,
      })
      if (currentRequest !== requestId.current) return
      setLoading(false)
      if (res.ok && res.value.playing) {
        setPlaying(true)
      } else {
        activeRef.current = false
        setPlaying(false)
        if (!res.ok) setError(res.error)
        else if (res.value?.error) setError(res.value.error)
      }
    } catch {
      if (currentRequest !== requestId.current) return
      activeRef.current = false
      setLoading(false)
      setPlaying(false)
      setError('Не удалось запустить воспроизведение VK')
    }
  }, [
    loading,
    playing,
    row.position,
    row.source.artist,
    row.source.duration,
    row.source.id,
    row.source.title,
    stop,
  ])

  return { playing, loading, error, progress, toggle, stop }
}
