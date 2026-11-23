import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ArrowRight, Link2, Undo2, Upload } from 'lucide-react'
import type { Collection, Working } from '../../../../shared/types'
import type { ViewState } from '../../../../shared/sync'
import type { SearchResultGroup } from '../../../../core/matching'
import { analyzeRow, type LibraryFilter } from '../../../../core/library'
import type { RowDraft } from '../../state/drafts'
import ExplainedButton from '../../components/ui/ExplainedButton'
import IconButton from '../../components/ui/IconButton'
import CompletenessNotice from '../collections/CompletenessNotice'
import { LibraryEmptyState } from './LibraryEmptyState'
import { CollectionQuickFilters, LibraryToolbar } from './LibraryToolbar'
import SearchControls from './SearchControls'
import { SelectionBulkBar } from './SelectionBulkBar'
import { TrackTable } from './table/TrackTable'
import { Inspector } from './inspector/Inspector'
import { useLibraryRows } from './useLibraryRows'
import { useInspectorLayout } from './inspector/useInspectorLayout'

export type Filter = LibraryFilter
const count = (number: number) => number.toLocaleString('ru-RU')

export type Draft = RowDraft

export interface LibraryViewProps {
  collection: Collection | undefined
  collectionId: string
  data: ViewState
  busy: string
  recentExportId: string | null
  onDismissRecentExport: () => void
  counts?: Record<Filter, number>
  focusId: string
  onFocusIdChange: (id: string) => void
  drafts?: Record<string, Draft>
  onDraftsChange?: React.Dispatch<React.SetStateAction<Record<string, Draft>>>
  query: string
  onQueryChange: (q: string) => void
  filter: Filter
  onFilterChange: (f: Filter) => void
  resultFilter: 'all' | SearchResultGroup
  onResultFilterChange: (rf: 'all' | SearchResultGroup) => void
  selected: Set<string>
  onSelectedChange: React.Dispatch<React.SetStateAction<Set<string>>>
  onImportFile: () => void
  onOpenVK: () => void
  onTransferClick: () => void
  onUndo: () => void
  onOpenSpotifyPanel: (jobId?: string) => void
  onContinueSearch: (id: string, browser: boolean) => void
  onSearch: (ids: string[], background?: boolean) => Promise<string | undefined>
  onControlJob: (id: string, action: 'pause' | 'resume') => void
  onPatch: (ids: string[], value: Partial<Working>) => Promise<boolean>
  onConfirmMetadata: (ids: string[]) => Promise<boolean>
  onLinkFile: (rowId: string) => Promise<boolean>
  onOpenExternal: (url: string) => void
  onBackToOverview?: () => void
  onInspectorOverlayChange?: (open: boolean) => void
}

export function LibraryView({
  collection,
  collectionId,
  data,
  busy,
  recentExportId,
  onDismissRecentExport,
  counts,
  focusId,
  onFocusIdChange,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  resultFilter,
  onResultFilterChange,
  selected,
  onSelectedChange,
  onImportFile,
  onOpenVK,
  onTransferClick,
  onUndo,
  onOpenSpotifyPanel,
  onContinueSearch,
  onSearch,
  onControlJob,
  onPatch,
  onConfirmMetadata,
  onLinkFile,
  onOpenExternal,
  onBackToOverview,
  onInspectorOverlayChange,
}: LibraryViewProps) {
  const inspector = useInspectorLayout()

  const {
    baseCount,
    rows,
    visibleIds,
    rowById,
    matchingIds,
    resultCounts,
    destinationCounts,
    selectedMatches,
    hiddenSelected,
    summary,
  } = useLibraryRows(collection, data.settings.matchingRules, query, filter, resultFilter, selected)

  const focused = useMemo(() => (focusId ? rowById.get(focusId) : undefined), [rowById, focusId])
  const effectiveCounts = counts ?? summary.destinations
  const searchCounts = { pending: summary.groups.pending, resolved: summary.groups.ready }
  const focusedIndex = useMemo(
    () => (focusId ? rows.findIndex((row) => row.id === focusId) : -1),
    [rows, focusId],
  )
  const compactOverlayOpen = !!focused && inspector.overlay

  const overlayCallbackRef = useRef(onInspectorOverlayChange)
  overlayCallbackRef.current = onInspectorOverlayChange
  useEffect(() => {
    onInspectorOverlayChange?.(compactOverlayOpen)
  }, [compactOverlayOpen, onInspectorOverlayChange])
  useEffect(() => () => overlayCallbackRef.current?.(false), [])

  const confirmSelection = useCallback(async () => {
    const ids = [...selected]
    const ok = await onConfirmMetadata(ids)
    if (ok) {
      const applied = new Set(ids)
      onSelectedChange((current) => new Set([...current].filter((id) => !applied.has(id))))
    }
  }, [selected, onConfirmMetadata, onSelectedChange])

  const handleFocusRow = useCallback(
    (id: string) => {
      onFocusIdChange(id)
      if (id) onSelectedChange(new Set([id]))
    },
    [onFocusIdChange, onSelectedChange],
  )

  const closeInspector = useCallback(() => {
    const activeRow = document.querySelector<HTMLElement>('.table-row.focused')
    onFocusIdChange('')
    requestAnimationFrame(() => {
      const target = activeRow?.isConnected
        ? activeRow
        : document.querySelector<HTMLInputElement>('.library-tools input')
      target?.focus()
    })
  }, [onFocusIdChange])

  const navigateReview = useCallback(
    (index: number, direction: 'Предыдущая запись' | 'Следующая запись') => {
      const targetRow = rows[index]
      if (!targetRow) return
      handleFocusRow(targetRow.id)
      requestAnimationFrame(() => {
        const target =
          inspector.panel.current?.querySelector<HTMLButtonElement>(
            `button[title="${direction}"]:not(:disabled)`,
          ) ??
          inspector.panel.current?.querySelector<HTMLButtonElement>(
            '.inspector-track-navigation button:not(:disabled)',
          ) ??
          inspector.panel.current?.querySelector<HTMLButtonElement>(
            'button[title="Закрыть запись"]',
          )
        target?.focus()
      })
    },
    [rows, handleFocusRow, inspector.panel],
  )

  const handleSelectQuickFilter = useCallback(
    (value: Filter) => {
      onFilterChange(value)
      onResultFilterChange('all')
      onQueryChange('')
    },
    [onFilterChange, onResultFilterChange, onQueryChange],
  )

  const handleResetFilters = useCallback(() => {
    onQueryChange('')
    onFilterChange('all')
    onResultFilterChange('all')
  }, [onQueryChange, onFilterChange, onResultFilterChange])

  const handleSelectAllVisible = useCallback(
    () => onSelectedChange(new Set(rows.map((row) => row.id))),
    [onSelectedChange, rows],
  )

  const handleSelectMatches = useCallback(() => {
    onSelectedChange(new Set(matchingIds))
    onResultFilterChange('exact')
  }, [onSelectedChange, matchingIds, onResultFilterChange])

  const handleStartSearch = useCallback(() => {
    if (!collection) return
    void onSearch(
      collection.rows
        .filter((row) => analyzeRow(row, data.settings.matchingRules).group === 'pending')
        .map((row) => row.id),
      true,
    )
  }, [collection, data.settings.matchingRules, onSearch])

  const handleOpenBrowser = useCallback(() => onOpenSpotifyPanel(), [onOpenSpotifyPanel])
  const handleBrowserResume = useCallback(
    (id: string) => onContinueSearch(id, true),
    [onContinueSearch],
  )
  const handlePatchSelected = useCallback(
    (value: Partial<Working>) => void onPatch([...selected], value),
    [onPatch, selected],
  )
  const handleRepeatSearch = useCallback(() => void onSearch([...selected]), [onSearch, selected])
  const handleKeepVisibleOnly = useCallback(
    () => onSelectedChange(new Set([...selected].filter((id) => visibleIds.has(id)))),
    [onSelectedChange, selected, visibleIds],
  )
  const handleClearSelection = useCallback(() => onSelectedChange(new Set()), [onSelectedChange])

  const canSearch = data.settings.searchProvider === 'browser' || data.spotify.connected

  return (
    <>
      <div className="page-heading library-heading">
        <div>
          {onBackToOverview && (
            <button type="button" onClick={onBackToOverview} className="collection-back">
              <ArrowLeft size={14} aria-hidden="true" /> Все коллекции
            </button>
          )}
          <h1>{collection?.name ?? 'Твоя музыка, целиком'}</h1>
          <p>
            {collection
              ? `${count(collection.rows.length)} записей · исходный порядок сохранён`
              : 'Сначала сохраним исходный список. Затем выберем путь для каждой записи.'}
          </p>
        </div>
        {collection ? (
          <div className="heading-actions library-actions">
            <ExplainedButton
              className="primary"
              hintLabel="Перенос в Spotify"
              hint={
                data.spotify.connected
                  ? 'Проверить состав и создать приватный плейлист.'
                  : 'Для создания плейлиста подключи Spotify API. Поиск через страницу работает отдельно.'
              }
              reason={busy ? 'Дождись завершения текущего действия.' : undefined}
              onClick={onTransferClick}
            >
              {data.spotify.connected ? 'Проверить перенос' : 'Подключить для переноса'}
              <ArrowRight size={16} aria-hidden="true" />
            </ExplainedButton>
            <IconButton title="Отменить последнюю правку" disabled={!!busy} onClick={onUndo}>
              <Undo2 size={18} aria-hidden="true" />
            </IconButton>
          </div>
        ) : (
          <div className="heading-actions">
            <button onClick={onImportFile} disabled={!!busy}>
              <Upload size={16} aria-hidden="true" />
              Импорт списка
            </button>
            <button className="primary" onClick={onOpenVK}>
              <Link2 size={16} aria-hidden="true" />
              Открыть VK
            </button>
          </div>
        )}
      </div>
      {!collection ? (
        <LibraryEmptyState busy={!!busy} onImportFile={onImportFile} onOpenVK={onOpenVK} />
      ) : (
        <>
          {recentExportId === collection.id && collection.completeness.status === 'unverified' && (
            <CompletenessNotice
              completeness={collection.completeness}
              totalCount={collection.rows.length}
              onDismiss={onDismissRecentExport}
            />
          )}
          <CollectionQuickFilters
            query={query}
            filter={filter}
            resultFilter={resultFilter}
            destinationSummary={summary.destinations}
            onSelectQuickFilter={handleSelectQuickFilter}
          />
          <div className={`library-panel collection-work ${focused ? 'with-inspector' : ''}`}>
            <div className="table-workspace library-list-pane" inert={compactOverlayOpen}>
              <SearchControls
                compact
                collectionId={collection.id}
                jobs={data.jobs}
                busy={!!busy}
                connected={canSearch}
                provider={data.settings.searchProvider}
                onOpenBrowser={handleOpenBrowser}
                onBrowserResume={handleBrowserResume}
                pending={searchCounts.pending}
                resolved={searchCounts.resolved}
                total={collection.rows.length}
                autoResume={data.settings.autoResumeSearch}
                onStart={handleStartSearch}
                onControl={onControlJob}
              />
              <LibraryToolbar
                query={query}
                onQueryChange={onQueryChange}
                filter={filter}
                onFilterChange={onFilterChange}
                resultFilter={resultFilter}
                onResultFilterChange={onResultFilterChange}
                onResetFilters={handleResetFilters}
                baseCount={baseCount}
                destinationCounts={destinationCounts}
                resultCounts={resultCounts}
                visibleCount={rows.length}
                matchingCount={matchingIds.length}
                busy={!!busy}
                onSelectAllVisible={handleSelectAllVisible}
                onSelectMatches={handleSelectMatches}
              />
              {selected.size > 0 && (
                <SelectionBulkBar
                  selectedCount={selected.size}
                  hiddenSelected={hiddenSelected}
                  selectedMatches={selectedMatches}
                  busy={!!busy}
                  canRepeatSearch={canSearch}
                  onConfirmSelection={() => void confirmSelection()}
                  onPatchSelected={handlePatchSelected}
                  onRepeatSearch={handleRepeatSearch}
                  onKeepVisibleOnly={handleKeepVisibleOnly}
                  onClearSelection={handleClearSelection}
                />
              )}
              <TrackTable
                rows={rows}
                visibleIds={visibleIds}
                selected={selected}
                onSelect={onSelectedChange}
                focusedId={focusId}
                onFocus={handleFocusRow}
                onReview={handleFocusRow}
                resetKey={`${collectionId}:${query}:${filter}:${resultFilter}`}
                matchingRules={data.settings.matchingRules}
              />
              <footer className="collection-footer">
                <span>
                  {count(rows.length)} из {count(effectiveCounts.all)} записей
                  {effectiveCounts.excluded > 0 && (
                    <> · {count(effectiveCounts.excluded)} исключено, сохранено в списке</>
                  )}
                </span>
                <span>Порядок VK сохранён</span>
              </footer>
            </div>
            {focused && (
              <>
                <div
                  className="inspector-resizer"
                  onPointerDown={inspector.startResize}
                  onKeyDown={inspector.resizeWithKeyboard}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Ширина инспектора"
                  aria-valuenow={inspector.width}
                  aria-valuemin={340}
                  aria-valuemax={800}
                  tabIndex={0}
                  title="Потяните для изменения ширины панели"
                />
                <Inspector
                  key={focused.id}
                  row={focused}
                  busy={!!busy}
                  jobs={data.jobs}
                  spotifyConnected={canSearch}
                  onClose={closeInspector}
                  onPatch={(value) => onPatch([focused.id], value)}
                  onLink={() => void onLinkFile(focused.id)}
                  onSearch={() => onSearch([focused.id])}
                  onExternal={onOpenExternal}
                  width={inspector.width}
                  panelRef={inspector.panel}
                  layout={inspector.layout}
                  isOverlay={compactOverlayOpen}
                  onLayoutChange={inspector.changeLayout}
                  onPrevious={
                    focusedIndex > 0
                      ? () => navigateReview(focusedIndex - 1, 'Предыдущая запись')
                      : undefined
                  }
                  onNext={
                    focusedIndex < rows.length - 1
                      ? () => navigateReview(focusedIndex + 1, 'Следующая запись')
                      : undefined
                  }
                />
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default LibraryView
