import { defaultMatchingRules } from '../../../../../shared/defaults'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type MatchingRules, type TrackRow } from '../../../../../shared/types'
import { analyzeRow, destinationLabels, formatDuration } from '../../../../../core/library'
import { searchResultLabels } from '../../../../../core/matching'
import { tableColumns, useColumnSizing } from './useColumnSizing'

type TableProps = {
  rows: TrackRow[]
  visibleIds?: Set<string>
  selected: Set<string>
  focusedId: string
  resetKey: string
  onSelect: (selection: Set<string>) => void
  onFocus: (id: string) => void
  onReview: (id: string) => void
  matchingRules?: MatchingRules
}
type RowProps = {
  row: TrackRow
  rowIndex: number
  selected: boolean
  focused: boolean
  tabbable: boolean
  start: number
  rules: MatchingRules
  onSelect: (id: string, selected: boolean, range: boolean) => void
  onFocus: (id: string) => void
  onReview: (id: string) => void
  onRowFocus: (id: string) => void
  onRowKeyDown: (row: TrackRow, event: React.KeyboardEvent<HTMLDivElement>) => void
  setRowRef: (id: string, node: HTMLDivElement | null) => void
}

/** Only visible records become React elements; no 9,000-row table model is built. */
const VisibleRow = memo(function VisibleRow({
  row,
  rowIndex,
  selected,
  focused,
  tabbable,
  start,
  rules,
  onSelect,
  onFocus,
  onReview,
  onRowFocus,
  onRowKeyDown,
  setRowRef,
}: RowProps) {
  const item = analyzeRow(row, rules)
  const attachRef = useCallback(
    (node: HTMLDivElement | null) => setRowRef(row.id, node),
    [row.id, setRowRef],
  )
  return (
    <div
      ref={attachRef}
      role="row"
      aria-rowindex={rowIndex}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`Запись ${row.position}: ${row.working.title}`}
      aria-selected={selected}
      onMouseDown={(event) => {
        if (
          event.shiftKey &&
          event.button === 0 &&
          !(event.target as Element).closest('input, button')
        ) {
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
        }
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onRowFocus(row.id)
      }}
      onClick={(event) => {
        if (event.shiftKey) {
          event.preventDefault()
          onSelect(row.id, true, true)
        } else onFocus(row.id)
      }}
      onKeyDown={(event) => onRowKeyDown(row, event)}
      className={`table-row ${focused ? 'focused' : ''} ${row.working.excluded ? 'excluded-row' : ''}`}
      style={{
        transform: `translateY(${start}px)`,
        gridTemplateColumns: 'var(--table-columns)',
        width: '100%',
        minWidth: 'var(--table-min-width)',
      }}
    >
      <div role="cell" className="cell cell-select">
        <input
          type="checkbox"
          aria-label={`Выбрать запись ${row.position}`}
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            onSelect(
              row.id,
              event.target.checked,
              event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey,
            )
          }
        />
      </div>
      <div role="cell" className="cell cell-position">
        <span className="position">{row.position}</span>
      </div>
      <div role="cell" className="cell cell-title">
        <div className="track-title">
          <strong>
            {row.working.title || 'Без названия'}
            {row.working.version && <span className="version-label">{row.working.version}</span>}
          </strong>
          <span>
            {row.working.artist || 'Без исполнителя'}
            {row.source.availability === 'blocked' && (
              <span className="blocked-text"> · недоступна в VK</span>
            )}
          </span>
        </div>
      </div>
      <div role="cell" className="cell cell-result">
        <span className={`status-tag result-${item.searchGroup}`}>
          {searchResultLabels[item.searchGroup]}
        </span>
      </div>
      <div role="cell" className="cell cell-status">
        <span className={`status-tag ${item.destination}`}>
          {destinationLabels[item.destination]}
        </span>
      </div>
      <div role="cell" className="cell cell-duration">
        <span className="duration">{formatDuration(row.source.duration)}</span>
      </div>
      <div role="cell" className="cell cell-open">
        {item.group === 'ready' ? (
          <ArrowRight className="row-arrow" size={15} aria-hidden="true" />
        ) : (
          <button
            className="table-review-button"
            aria-label={`Разобрать запись ${row.position}`}
            title="Сравнить версии"
            onClick={(event) => {
              event.stopPropagation()
              onReview(row.id)
            }}
          >
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
})

export const TrackTable = memo(function TrackTable({
  rows,
  visibleIds,
  selected,
  onSelect,
  focusedId,
  onFocus,
  onReview,
  resetKey,
  matchingRules = defaultMatchingRules,
}: TableProps) {
  const container = useRef<HTMLDivElement>(null)
  const headerScroll = useRef<HTMLDivElement>(null)
  const rowElements = useRef(new Map<string, HTMLDivElement>())
  const pendingFocusId = useRef<string | null>(null)
  const [activeRowId, setActiveRowId] = useState('')
  const selection = useRef({ rows, selected, onSelect, onFocus, focusedId, resetKey })
  selection.current = { rows, selected, onSelect, onFocus, focusedId, resetKey }
  const selectionAnchor = useRef<{ id: string; resetKey: string } | null>(null)
  const columns = useColumnSizing()

  const fallbackVisibleIds = useMemo(
    () => (visibleIds ? null : new Set(rows.map((row) => row.id))),
    [visibleIds, rows],
  )
  const effectiveVisibleIds = visibleIds ?? fallbackVisibleIds!

  const setRowRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) rowElements.current.set(id, node)
    else rowElements.current.delete(id)
  }, [])

  const selectRow = useCallback((id: string, checked: boolean, range: boolean) => {
    const current = selection.current
    const targetIndex = current.rows.findIndex((row) => row.id === id)
    if (targetIndex < 0) return
    const anchorId =
      selectionAnchor.current?.resetKey === current.resetKey
        ? selectionAnchor.current.id
        : current.focusedId
    const anchorIndex = range ? current.rows.findIndex((row) => row.id === anchorId) : -1
    const affectedRows =
      anchorIndex < 0
        ? [current.rows[targetIndex]]
        : current.rows.slice(
            Math.min(anchorIndex, targetIndex),
            Math.max(anchorIndex, targetIndex) + 1,
          )
    const next = new Set(current.selected)
    for (const row of affectedRows) {
      if (checked) next.add(row.id)
      else next.delete(row.id)
    }
    if (!range || anchorIndex < 0) selectionAnchor.current = { id, resetKey: current.resetKey }
    current.onSelect(next)
  }, [])

  useEffect(() => {
    if (!selected.size) selectionAnchor.current = null
  }, [selected])

  const visibleSelectedCount = useMemo(() => {
    if (!selected.size || !rows.length) return 0
    let count = 0
    if (selected.size <= rows.length) {
      for (const id of selected) {
        if (effectiveVisibleIds.has(id)) count++
      }
    } else {
      for (const row of rows) {
        if (selected.has(row.id)) count++
      }
    }
    return count
  }, [rows, selected, effectiveVisibleIds])

  const allSelected = rows.length > 0 && visibleSelectedCount === rows.length
  const partlySelected = visibleSelectedCount > 0 && visibleSelectedCount < rows.length

  const getKey = useCallback((index: number) => rows[index]?.id ?? index, [rows])
  const virtual = useVirtualizer({
    count: rows.length,
    getItemKey: getKey,
    getScrollElement: () => container.current,
    estimateSize: () => 60,
    overscan: 10,
  })

  useEffect(() => {
    selectionAnchor.current = null
    pendingFocusId.current = null
    setActiveRowId('')
    virtual.scrollToOffset(0)
  }, [resetKey, virtual])

  const handleRowKeyDown = useCallback(
    (row: TrackRow, event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return
      const current = selection.current
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (event.key === ' ' && event.shiftKey) selectRow(row.id, true, true)
        else current.onFocus(row.id)
        return
      }
      let targetIndex = -1
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const currentIndex = current.rows.findIndex((item) => item.id === row.id)
        if (currentIndex < 0) return
        targetIndex =
          event.key === 'ArrowDown'
            ? Math.min(current.rows.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1)
      } else if (event.key === 'Home') {
        targetIndex = 0
      } else if (event.key === 'End') {
        targetIndex = current.rows.length - 1
      }
      if (targetIndex < 0) return
      event.preventDefault()
      const nextRow = current.rows[targetIndex]
      if (!nextRow || nextRow.id === row.id) return
      setActiveRowId(nextRow.id)
      pendingFocusId.current = nextRow.id
      virtual.scrollToIndex(targetIndex, { align: 'auto' })
    },
    [selectRow, virtual],
  )

  useEffect(() => {
    const targetId = pendingFocusId.current
    if (!targetId) return
    const element = rowElements.current.get(targetId)
    if (!element) return
    pendingFocusId.current = null
    if (
      container.current?.contains(document.activeElement) ||
      document.activeElement === document.body
    ) {
      element.focus({ preventScroll: true })
    }
  })

  const virtualItems = virtual.getVirtualItems()
  const candidateActiveId =
    focusedId && effectiveVisibleIds.has(focusedId)
      ? focusedId
      : activeRowId && effectiveVisibleIds.has(activeRowId)
        ? activeRowId
        : ''
  const hasRenderedActive = candidateActiveId
    ? virtualItems.some((item) => rows[item.index]?.id === candidateActiveId)
    : false
  const scrollTop = container.current?.scrollTop ?? 0
  const firstVisibleItem = virtualItems.find((item) => item.end > scrollTop) ?? virtualItems[0]
  const tabbableId = hasRenderedActive
    ? candidateActiveId
    : (rows[firstVisibleItem?.index ?? 0]?.id ?? '')

  return (
    <section
      ref={columns.table}
      className="table-panel"
      role="table"
      aria-rowcount={rows.length + 1}
      aria-label="Список музыки"
      style={
        {
          '--table-columns': columns.gridTemplateColumns,
          '--table-min-width': columns.minWidth,
        } as React.CSSProperties
      }
    >
      <div className="table-header-wrapper" ref={headerScroll}>
        <div
          ref={columns.header}
          className="table-header"
          role="row"
          aria-rowindex={1}
          style={{
            gridTemplateColumns: 'var(--table-columns)',
            width: columns.width,
            minWidth: 'var(--table-min-width)',
          }}
        >
          {tableColumns.map((column) => (
            <div
              key={column.id}
              role="columnheader"
              aria-label={column.label || undefined}
              className={`cell cell-${column.id}`}
              style={{ position: 'relative' }}
            >
              {column.id === 'select' ? (
                <input
                  type="checkbox"
                  aria-label="Выделить все записи выборки"
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = partlySelected
                  }}
                  onChange={(event) => {
                    selectionAnchor.current = null
                    onSelect(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                  }}
                />
              ) : (
                column.label
              )}
              {column.resize && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ширина столбца: ${column.label}`}
                  aria-valuenow={columns.sizes[column.id] ?? column.width}
                  aria-valuemin={column.min}
                  aria-valuemax={column.max}
                  tabIndex={0}
                  className={`table-column-resizer ${columns.resizing === column.id ? 'isResizing' : ''}`}
                  onPointerDown={(event) => columns.startResize(column.id, event)}
                  onKeyDown={(event) => columns.resizeWithKeyboard(column.id, event)}
                  onClick={(event) => event.stopPropagation()}
                  title="Потяните для изменения ширины столбца"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div
        className="table-scroll"
        ref={container}
        onScroll={(event) => {
          if (headerScroll.current) headerScroll.current.scrollLeft = event.currentTarget.scrollLeft
        }}
      >
        {!rows.length ? (
          <div className="filtered-empty">
            <Search size={27} aria-hidden="true" />
            <h2>Нет записей по этому запросу</h2>
            <p>Измени поиск или фильтр. Исходные записи остаются в коллекции.</p>
          </div>
        ) : (
          <div
            className="virtual-body"
            role="rowgroup"
            style={{
              height: virtual.getTotalSize(),
              width: columns.width,
              minWidth: 'var(--table-min-width)',
            }}
          >
            {virtualItems.map((item) => {
              const row = rows[item.index]
              if (!row) return null
              return (
                <VisibleRow
                  key={item.key}
                  row={row}
                  rowIndex={item.index + 2}
                  start={item.start}
                  selected={selected.has(row.id)}
                  focused={focusedId === row.id}
                  tabbable={row.id === tabbableId}
                  rules={matchingRules}
                  onSelect={selectRow}
                  onFocus={onFocus}
                  onReview={onReview}
                  onRowFocus={setActiveRowId}
                  onRowKeyDown={handleRowKeyDown}
                  setRowRef={setRowRef}
                />
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
})
