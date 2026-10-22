import { useCallback, useEffect, useRef, useState } from 'react'

type Layout = 'parallel' | 'sequential'
const clamp = (width: number) => Math.min(800, Math.max(340, width))
function read<T>(key: string, fallback: T, parse: (value: string) => T): T {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : parse(value)
  } catch {
    return fallback
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Optional preference. */
  }
}

export function useInspectorLayout() {
  const [overlay, setOverlay] = useState(() => window.matchMedia('(max-width: 1250px)').matches)
  const [layout, setLayout] = useState<Layout>(() =>
    read('vkspot_inspector_layout', 'parallel', (value) =>
      value === 'sequential' ? value : 'parallel',
    ),
  )
  const [width, setWidth] = useState(() =>
    read('vkspot_inspector_width', 580, (value) =>
      Number.isFinite(Number(value)) ? clamp(Number(value)) : 580,
    ),
  )
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1250px)')
    const update = (event: MediaQueryListEvent) => {
      setOverlay(event.matches)
      if (event.matches) panel.current?.querySelector('h2')?.focus({ preventScroll: true })
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const changeLayout = useCallback((next: Layout) => {
    setLayout(next)
    save('vkspot_inspector_layout', next)
    setWidth((current) => {
      const value =
        next === 'sequential' && current > 500
          ? 380
          : next === 'parallel' && current < 550
            ? 660
            : current
      save('vkspot_inspector_width', String(value))
      return value
    })
  }, [])

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    cleanup.current?.()
    const startX = event.clientX,
      initial = width
    let latest = width,
      frame = 0
    const cursor = document.body.style.cursor,
      selection = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (event: PointerEvent) => {
      latest = clamp(Math.min(window.innerWidth - 380, initial + startX - event.clientX))
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          if (panel.current) panel.current.style.width = `${latest}px`
        })
    }
    const release = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.style.cursor = cursor
      document.body.style.userSelect = selection
      cleanup.current = null
    }
    const finish = () => {
      release()
      setWidth(latest)
      save('vkspot_inspector_width', String(latest))
    }
    cleanup.current = release
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
  }
  const resizeWithKeyboard = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setWidth((current) => {
      const next = clamp(current + (event.key === 'ArrowLeft' ? 10 : -10))
      save('vkspot_inspector_width', String(next))
      return next
    })
  }
  return { layout, width, panel, overlay, changeLayout, startResize, resizeWithKeyboard }
}
