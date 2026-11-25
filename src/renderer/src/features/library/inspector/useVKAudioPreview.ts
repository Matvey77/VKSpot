import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackRow } from '../../../../../shared/types'
import { api } from '../../../state/api'

const DEFAULT_PROGRESS = 'Ищем запись в «Моей музыке» VK…'
const VOLUME_KEY = 'vkspot_vk_volume'
const LAST_VOLUME_KEY = 'vkspot_vk_last_volume'
const DEFAULT_VOLUME = 80

const clampVolume = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : DEFAULT_VOLUME

function readStoredVolume(key: string, fallback: number, min = 0): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(min, Math.min(100, Math.round(parsed)))
  } catch {
    return fallback
  }
}

function saveStoredVolume(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* Optional preference. */
  }
}

export function useVKAudioPreview(row: TrackRow, onBeforePlay?: () => void) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(DEFAULT_PROGRESS)
  const [volume, setVolumeState] = useState(() => readStoredVolume(VOLUME_KEY, DEFAULT_VOLUME, 0))
  const requestId = useRef(0)
  const activeRef = useRef(false)
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const lastNonZeroRef = useRef(
    volume > 0 ? volume : readStoredVolume(LAST_VOLUME_KEY, DEFAULT_VOLUME, 1),
  )
  const lastSentAtRef = useRef(0)
  const pendingVolumeRef = useRef<number | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const beforePlayRef = useRef(onBeforePlay)
  beforePlayRef.current = onBeforePlay

  useEffect(() => api.onVKAudioProgress(setProgress), [])

  useEffect(
    () => () => {
      if (throttleTimerRef.current !== undefined) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = undefined
      }
      if (pendingVolumeRef.current !== null) {
        const trailing = pendingVolumeRef.current
        pendingVolumeRef.current = null
        void api.setVKVolume(trailing)
      }
    },
    [],
  )

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

  const syncVolume = useCallback((next: number, immediate = false) => {
    const now = Date.now()
    if (immediate || now - lastSentAtRef.current >= 40) {
      if (throttleTimerRef.current !== undefined) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = undefined
      }
      pendingVolumeRef.current = null
      lastSentAtRef.current = now
      void api.setVKVolume(next)
      return
    }
    pendingVolumeRef.current = next
    if (throttleTimerRef.current === undefined) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = undefined
        if (pendingVolumeRef.current !== null) {
          const trailing = pendingVolumeRef.current
          pendingVolumeRef.current = null
          lastSentAtRef.current = Date.now()
          void api.setVKVolume(trailing)
        }
      }, 40)
    }
  }, [])

  const applyVolume = useCallback(
    (next: number, immediate = false) => {
      const clamped = clampVolume(next)
      volumeRef.current = clamped
      setVolumeState(clamped)
      saveStoredVolume(VOLUME_KEY, clamped)
      if (clamped > 0) {
        lastNonZeroRef.current = clamped
        saveStoredVolume(LAST_VOLUME_KEY, clamped)
      }
      syncVolume(clamped, immediate)
    },
    [syncVolume],
  )

  const setVolume = useCallback((next: number) => applyVolume(next, false), [applyVolume])

  const toggleMute = useCallback(() => {
    if (volumeRef.current === 0) {
      const restored = lastNonZeroRef.current > 0 ? lastNonZeroRef.current : DEFAULT_VOLUME
      applyVolume(restored, true)
    } else {
      lastNonZeroRef.current = volumeRef.current
      saveStoredVolume(LAST_VOLUME_KEY, volumeRef.current)
      applyVolume(0, true)
    }
  }, [applyVolume])

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
        volume: volumeRef.current,
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

  return { playing, loading, error, progress, volume, setVolume, toggleMute, toggle, stop }
}
