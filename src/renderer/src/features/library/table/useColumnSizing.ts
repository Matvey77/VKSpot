import { useCallback, useEffect, useRef, useState } from 'react'

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
const key = 'vkspot_column_sizing'

function loadSizes(): Sizing {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as Sizing
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

export function useColumnSizing() {
  const [sizes, setSizes] = useState<Sizing>(loadSizes)
  const [resizing, setResizing] = useState<ColumnId | null>(null)
  const header = useRef<HTMLDivElement>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const measuredSizes = useCallback((): Sizing => {
    const result: Sizing = {}
    const cells = header.current?.children
    tableColumns.forEach((column, index) => {
      result[column.id] = cells?.[index]?.getBoundingClientRect().width ?? column.width
    })
    return result
  }, [])

  const persist = (next: Sizing) => {
    setSizes(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* Read-only browser storage must not block resizing. */
    }
  }

  const startResize = (id: ColumnId, event: React.PointerEvent) => {
    event.preventDefault()
    cleanup.current?.()
    const column = tableColumns.find((column) => column.id === id)!
    const initial = measuredSizes(),
      startX = event.clientX
    let latest = initial,
      frame = 0
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setResizing(id)
    const move = (event: PointerEvent) => {
      latest = {
        ...initial,
        [id]: Math.min(column.max, Math.max(column.min, initial[id]! + event.clientX - startX)),
      }
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          setSizes(latest)
        })
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
  }

  const resizeWithKeyboard = (id: ColumnId, event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const column = tableColumns.find((column) => column.id === id)!
    const initial = measuredSizes()
    persist({
      ...initial,
      [id]: Math.min(
        column.max,
        Math.max(column.min, initial[id]! + (event.key === 'ArrowRight' ? 10 : -10)),
      ),
    })
  }

  const custom = Object.keys(sizes).length > 0
  return {
    header,
    sizes,
    resizing,
    startResize,
    resizeWithKeyboard,
    gridTemplateColumns: custom
      ? tableColumns.map((column) => `${sizes[column.id] ?? column.width}px`).join(' ')
      : '36px 40px minmax(140px, 1fr) 138px 112px 52px 32px',
    width: custom
      ? tableColumns.reduce((sum, column) => sum + (sizes[column.id] ?? column.width), 0)
      : '100%',
  }
}
