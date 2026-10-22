import { defaultMatchingRules } from '../../../../../shared/defaults'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type MatchingRules, type TrackRow } from '../../../../../shared/model'
import { analyzeRow, destinationLabels, formatDuration } from '../../../../../core/library'
import { searchResultLabels } from '../../../../../core/matching'
import { tableColumns, useColumnSizing } from './useColumnSizing'

type TableProps = {
  rows: TrackRow[]
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
  selected: boolean
  focused: boolean
  start: number
  gridTemplateColumns: string
  width: number | string
  rules: MatchingRules
  onSelect: (id: string, selected: boolean) => void
  onFocus: (id: string) => void
  onReview: (id: string) => void
}

/** Only visible records become React elements; no 9,000-row table model is built. */
const VisibleRow = memo(function VisibleRow({
  row,
  selected,
  focused,
  start,
  gridTemplateColumns,
  width,
  rules,
  onSelect,
  onFocus,
  onReview,
}: RowProps) {
  const item = analyzeRow(row, rules)
  return (
    <div
      role="row"
      tabIndex={0}
      aria-label={`Запись ${row.position}: ${row.working.title}`}
      aria-selected={selected}
      onClick={() => onFocus(row.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onFocus(row.id)
        }
      }}
      className={`table-row ${focused ? 'focused' : ''} ${row.working.excluded ? 'excluded-row' : ''}`}
      style={{ transform: `translateY(${start}px)`, gridTemplateColumns, width, minWidth: '100%' }}
    >
      <div role="cell" className="cell cell-select">
        <input
          type="checkbox"
          aria-label={`Выбрать запись ${row.position}`}
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSelect(row.id, event.target.checked)}
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
          <ArrowRight className="row-arrow" size={15} />
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
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
})

export const TrackTable = memo(function TrackTable({
  rows,
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
  const selection = useRef({ selected, onSelect })
  selection.current = { selected, onSelect }
  const columns = useColumnSizing()
  const selectRow = useCallback((id: string, checked: boolean) => {
    const next = new Set(selection.current.selected)
    if (checked) next.add(id)
    else next.delete(id)
    selection.current.onSelect(next)
  }, [])
  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((row) => selected.has(row.id)),
    [rows, selected],
  )
  const partlySelected = useMemo(
    () => !allSelected && rows.some((row) => selected.has(row.id)),
    [rows, selected, allSelected],
  )
  const getKey = useCallback((index: number) => rows[index]?.id ?? index, [rows])
  const virtual = useVirtualizer({
    count: rows.length,
    getItemKey: getKey,
    getScrollElement: () => container.current,
    estimateSize: () => 60,
    overscan: 10,
  })
  useEffect(() => {
    virtual.scrollToOffset(0)
  }, [resetKey])

  return (
    <section
      className="table-panel"
      role="table"
      aria-rowcount={rows.length + 1}
      aria-label="Список музыки"
    >
      <div className="table-header-wrapper" ref={headerScroll}>
        <div
          ref={columns.header}
          className="table-header"
          role="row"
          style={{
            gridTemplateColumns: columns.gridTemplateColumns,
            width: columns.width,
            minWidth: '100%',
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
                  onChange={(event) =>
                    onSelect(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                  }
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
            <Search size={27} />
            <h2>Нет записей по этому запросу</h2>
            <p>Измени поиск или фильтр. Исходные записи остаются в коллекции.</p>
          </div>
        ) : (
          <div
            className="virtual-body"
            role="rowgroup"
            style={{ height: virtual.getTotalSize(), width: columns.width, minWidth: '100%' }}
          >
            {virtual.getVirtualItems().map((item) => (
              <VisibleRow
                key={item.key}
                row={rows[item.index]}
                start={item.start}
                selected={selected.has(rows[item.index].id)}
                focused={focusedId === rows[item.index].id}
                gridTemplateColumns={columns.gridTemplateColumns}
                width={columns.width}
                rules={matchingRules}
                onSelect={selectRow}
                onFocus={onFocus}
                onReview={onReview}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
})
