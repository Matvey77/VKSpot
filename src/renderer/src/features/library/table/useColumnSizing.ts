import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const tableColumns = [
  { id: 'select', label: '', width: 38, min: 38, max: 50, resize: false },
  { id: 'position', label: '№', width: 48, min: 36, max: 100, resize: true },
  { id: 'title', label: 'Запись', width: 380, min: 140, max: 1200, resize: true },
  { id: 'result', label: 'Результат поиска', width: 158, min: 100, max: 300, resize: true },
  { id: 'status', label: 'Назначение', width: 140, min: 90, max: 300, resize: true },
  { id: 'duration', label: 'Время', width: 62, min: 45, max: 120, resize: true },
  { id: 'open', label: '', width: 32, min: 32, max: 50, resize: false },
] as const
export type ColumnId = (typeof tableColumns)[number]['id']
type Sizing = Partial<Record<ColumnId, number>>

const STORAGE_KEY = 'vkspot_column_sizing'
const defaultTrackWidths: Record<ColumnId, number> = {
  select: 36,
  position: 40,
  title: 140,
  result: 138,
  status: 112,
  duration: 52,
  open: 32,
}

function loadSizes(): Sizing {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Sizing
    const result: Sizing = {}
    for (const column of tableColumns) {
      const value = saved[column.id]
      if (typeof value === 'number' && Number.isFinite(value))
        result[column.id] = Math.min(column.max, Math.max(column.min, value))
    }
    return result
  } catch {
    return {}
  }
}

function buildGridTemplate(sizes: Sizing): string {
  return tableColumns
    .map((column) => {
      if (column.id === 'title') {
        const minTitle = sizes.title ?? defaultTrackWidths.title
        return `minmax(${minTitle}px, 1fr)`
      }
      return `${sizes[column.id] ?? defaultTrackWidths[column.id]}px`
    })
    .join(' ')
}

function buildMinWidth(sizes: Sizing): string {
  const total = tableColumns.reduce((sum, column) => {
    const width =
      column.id === 'title'
        ? (sizes.title ?? defaultTrackWidths.title)
        : (sizes[column.id] ?? defaultTrackWidths[column.id])
    return sum + width
  }, 0)
  return `${total}px`
}

export function useColumnSizing() {
  const [sizes, setSizes] = useState<Sizing>(loadSizes)
  const [resizing, setResizing] = useState<ColumnId | null>(null)
  const table = useRef<HTMLElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const sizesRef = useRef(sizes)
  sizesRef.current = sizes
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const measuredWidth = useCallback((id: ColumnId): number | undefined => {
    const index = tableColumns.findIndex((column) => column.id === id)
    return index >= 0 ? header.current?.children[index]?.getBoundingClientRect().width : undefined
  }, [])

  const applyDomSizing = useCallback((next: Sizing) => {
    if (!table.current) return
    table.current.style.setProperty('--table-columns', buildGridTemplate(next))
    table.current.style.setProperty('--table-min-width', buildMinWidth(next))
  }, [])

  const persist = useCallback((next: Sizing) => {
    setSizes(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* Read-only browser storage must not block resizing. */
    }
  }, [])

  const startResize = useCallback(
    (id: ColumnId, event: React.PointerEvent) => {
      event.preventDefault()
      cleanup.current?.()
      const column = tableColumns.find((col) => col.id === id)!
      const handle = event.currentTarget as HTMLElement
      const startWidth = measuredWidth(id) ?? sizesRef.current[id] ?? column.width
      const startX = event.clientX
      let latest: Sizing = sizesRef.current
      let frame = 0
      const previousCursor = document.body.style.cursor
      const previousSelect = document.body.style.userSelect
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      setResizing(id)

      const move = (moveEvent: PointerEvent) => {
        const nextWidth = Math.round(
          Math.min(column.max, Math.max(column.min, startWidth + moveEvent.clientX - startX)),
        )
        latest = { ...sizesRef.current, [id]: nextWidth }
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0
            applyDomSizing(latest)
            handle.setAttribute('aria-valuenow', String(nextWidth))
          })
        }
      }
      const release = () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousSelect
        cleanup.current = null
      }
      const finish = () => {
        release()
        persist(latest)
        setResizing(null)
      }
      cleanup.current = release
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', finish, { once: true })
      window.addEventListener('pointercancel', finish, { once: true })
    },
    [applyDomSizing, measuredWidth, persist],
  )

  const resizeWithKeyboard = useCallback(
    (id: ColumnId, event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const column = tableColumns.find((col) => col.id === id)!
      const currentWidth = measuredWidth(id) ?? sizesRef.current[id] ?? column.width
      const nextWidth = Math.round(
        Math.min(
          column.max,
          Math.max(column.min, currentWidth + (event.key === 'ArrowRight' ? 10 : -10)),
        ),
      )
      persist({ ...sizesRef.current, [id]: nextWidth })
    },
    [measuredWidth, persist],
  )

  const gridTemplateColumns = useMemo(() => buildGridTemplate(sizes), [sizes])
  const minWidth = useMemo(() => buildMinWidth(sizes), [sizes])

  return {
    table,
    header,
    sizes,
    resizing,
    startResize,
    resizeWithKeyboard,
    gridTemplateColumns,
    width: '100%',
    minWidth,
  }
}
