import { useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CheckCheck,
  Clock,
  FileAudio,
  FolderOpen,
  ListPlus,
  Link2,
  ListFilter,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import type { Collection, Working } from '../../../../shared/model'
import type { ViewState } from '../../../../shared/sync'
import { searchResultLabels, type SearchResultGroup } from '../../../../core/matching'
import ExplainedButton from '../../components/ui/ExplainedButton'
import IconButton from '../../components/ui/IconButton'
import CompletenessNotice from '../collections/CompletenessNotice'
import SearchControls from './SearchControls'
import { TrackTable } from './table/TrackTable'
import { Inspector } from './inspector/Inspector'
import { useLibraryRows } from './useLibraryRows'
import { useInspectorLayout } from './inspector/useInspectorLayout'
import {
  analyzeRow,
  destinationLabels as labels,
  type LibraryFilter,
} from '../../../../core/library'
import { SpotifyIcon, VKIcon } from '../../components/brand/BrandIcons'

export type Filter = LibraryFilter
const count = (number: number) => number.toLocaleString('ru-RU')

export type Draft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>

export interface LibraryViewProps {
  collection: Collection | undefined
  collectionId: string
  data: ViewState
  busy: string
  recentExportId: string | null
  onDismissRecentExport: () => void
  counts: Record<Filter, number>
  focusId: string
  onFocusIdChange: (id: string) => void
  drafts: Record<string, Draft>
  onDraftsChange: React.Dispatch<React.SetStateAction<Record<string, Draft>>>
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
  drafts,
  onDraftsChange,
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
}: LibraryViewProps) {
  const inspector = useInspectorLayout()

  const focused = useMemo(
    () => collection?.rows.find((row) => row.id === focusId),
    [collection, focusId],
  )
  const {
    baseRows,
    rows,
    matchingRows,
    resultCounts,
    destinationCounts,
    selectedMatches,
    hiddenSelected,
    summary,
  } = useLibraryRows(collection, data.settings.matchingRules, query, filter, resultFilter, selected)
  const searchCounts = { pending: summary.groups.pending, resolved: summary.groups.ready }
  const focusedIndex = rows.findIndex((row) => row.id === focusId)
  const quickFilters: Filter[] = ['all', 'unresolved', 'spotify', 'local', 'excluded']

  const confirmSelection = async () => {
    const ids = [...selected]
    const ok = await onConfirmMetadata(ids)
    if (ok) {
      const applied = new Set(ids)
      onSelectedChange((current) => new Set([...current].filter((id) => !applied.has(id))))
    }
  }

  const handleFocusRow = useCallback(
    (id: string) => {
      onFocusIdChange(id)
      if (id) onSelectedChange(new Set([id]))
    },
    [onFocusIdChange, onSelectedChange],
  )
  const openReviewRow = handleFocusRow
  const closeInspector = () => {
    const activeRow = document.querySelector<HTMLElement>('.table-row.focused')
    onFocusIdChange('')
    requestAnimationFrame(() => {
      const target = activeRow?.isConnected
        ? activeRow
        : document.querySelector<HTMLInputElement>('.library-tools input')
      target?.focus()
    })
  }
  const navigateReview = (index: number, direction: 'Предыдущая запись' | 'Следующая запись') => {
    const nextId = rows[index].id
    handleFocusRow(nextId)
    requestAnimationFrame(() => {
      const target =
        inspector.panel.current?.querySelector<HTMLButtonElement>(
          `button[title="${direction}"]:not(:disabled)`,
        ) ??
        inspector.panel.current?.querySelector<HTMLButtonElement>(
          '.inspector-track-navigation button:not(:disabled)',
        ) ??
        inspector.panel.current?.querySelector<HTMLButtonElement>('button[title="Закрыть запись"]')
      target?.focus()
    })
  }

  return (
    <>
      <div className="page-heading library-heading">
        <div>
          {onBackToOverview && (
            <button type="button" onClick={onBackToOverview} className="collection-back">
              <ArrowLeft size={14} /> Все коллекции
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
              <ArrowRight size={16} />
            </ExplainedButton>
            <IconButton title="Отменить последнюю правку" disabled={!!busy} onClick={onUndo}>
              <Undo2 size={18} />
            </IconButton>
          </div>
        ) : (
          <div className="heading-actions">
            <button onClick={onImportFile} disabled={!!busy}>
              <Upload size={16} />
              Импорт списка
            </button>
            <button className="primary" onClick={onOpenVK}>
              <Link2 size={16} />
              Открыть VK
            </button>
          </div>
        )}
      </div>
      {!collection ? (
        <section className="empty-library">
          <div className="empty-path">
            <span className="source-icon">
              <VKIcon size={48} />
            </span>
            <span className="path-line" />
            <FolderOpen size={36} />
            <span className="path-line" />
            <span className="destination-icon">
              <SpotifyIcon size={44} />
            </span>
          </div>
          <h2>Начни с полного списка</h2>
          <p>
            Импортируй JSON, CSV или TXT — либо открой свою музыку в VK. Повторы и недоступные
            записи останутся в архиве.
          </p>
          <div className="empty-actions">
            <button className="primary" onClick={onImportFile} disabled={!!busy}>
              <Upload size={17} />
              Выбрать файл
            </button>
            <button onClick={onOpenVK}>
              Выгрузить из VK
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="empty-footnotes">
            <span>
              <Check size={15} />
              Исходные названия сохраняются
            </span>
            <span>
              <Check size={15} />
              Правки можно отменить
            </span>
            <span>
              <Check size={15} />
              Всё хранится локально
            </span>
          </div>
        </section>
      ) : (
        <>
          {recentExportId === collection.id && collection.completeness.status === 'unverified' && (
            <CompletenessNotice
              completeness={collection.completeness}
              totalCount={collection.rows.length}
              onDismiss={onDismissRecentExport}
            />
          )}
          <div className="collection-navigation">
            <div className="collection-facets" role="group" aria-label="Быстрые фильтры коллекции">
              {quickFilters.map((value) => (
                <button
                  key={value}
                  aria-pressed={filter === value && resultFilter === 'all' && !query}
                  onClick={() => {
                    onFilterChange(value)
                    onResultFilterChange('all')
                    onQueryChange('')
                  }}
                >
                  {value === 'spotify' && <SpotifyIcon size={15} />}
                  {labels[value]}
                  <span>{count(summary.destinations[value])}</span>
                </button>
              ))}
            </div>
            <span className="collection-safety">
              <ShieldCheck size={15} /> Оригинал сохранён
            </span>
          </div>
          <div className={`library-panel collection-work ${focused ? 'with-inspector' : ''}`}>
            <div
              className="table-workspace library-list-pane"
              inert={!!focused && inspector.overlay}
            >
              <SearchControls
                compact
                collectionId={collection.id}
                jobs={data.jobs}
                busy={!!busy}
                connected={data.settings.searchProvider === 'browser' || data.spotify.connected}
                provider={data.settings.searchProvider}
                onOpenBrowser={() => onOpenSpotifyPanel()}
                onBrowserResume={(id) => onContinueSearch(id, true)}
                pending={searchCounts.pending}
                resolved={searchCounts.resolved}
                total={collection.rows.length}
                autoResume={data.settings.autoResumeSearch}
                onStart={() =>
                  onSearch(
                    collection.rows
                      .filter(
                        (row) => analyzeRow(row, data.settings.matchingRules).group === 'pending',
                      )
                      .map((row) => row.id),
                    true,
                  )
                }
                onControl={onControlJob}
              />
              <div className="library-tools">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Найти запись"
                    placeholder="Исполнитель, название или ID VK"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                  />
                </div>
                <label className="library-filter">
                  <span>Решение о переносе</span>
                  <div className="filter-select">
                    <ListFilter size={16} />
                    <select
                      aria-label="Статус записей"
                      value={filter}
                      onChange={(e) => onFilterChange(e.target.value as Filter)}
                    >
                      {Object.entries(labels).map(([key, name]) => (
                        <option key={key} value={key}>
                          {key === 'local-pending' ? 'Нужен локальный файл' : name} (
                          {count(destinationCounts[key as Filter])})
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="library-filter">
                  <span>Результат поиска</span>
                  <select
                    aria-label="Результат поиска"
                    title="Последняя выдача Spotify. Этот фильтр применяется вместе с решением и текстовым поиском."
                    value={resultFilter}
                    onChange={(event) =>
                      onResultFilterChange(event.target.value as typeof resultFilter)
                    }
                  >
                    <option value="all">Все результаты ({count(baseRows.length)})</option>
                    {Object.entries(searchResultLabels).map(([group, label]) => (
                      <option key={group} value={group}>
                        {label} ({count(resultCounts[group as SearchResultGroup])})
                      </option>
                    ))}
                  </select>
                </label>
                {(query || filter !== 'all' || resultFilter !== 'all') && (
                  <IconButton
                    title="Сбросить фильтры"
                    onClick={() => {
                      onQueryChange('')
                      onFilterChange('all')
                      onResultFilterChange('all')
                    }}
                  >
                    <X size={16} />
                  </IconButton>
                )}
              </div>
              <div className="table-selection-tools">
                <button
                  disabled={!rows.length || !!busy}
                  onClick={() => onSelectedChange(new Set(rows.map((row) => row.id)))}
                >
                  Выделить выборку ({count(rows.length)})
                </button>
                <ExplainedButton
                  hintLabel="Почему нельзя выделить совпадения"
                  reason={
                    busy
                      ? 'Дождись завершения текущего действия.'
                      : !matchingRows.length
                        ? 'В этой выборке пока нет записей «Совпадают данные». Можно изменить фильтры или дождаться результатов поиска.'
                        : undefined
                  }
                  onClick={() => {
                    onSelectedChange(new Set(matchingRows.map((row) => row.id)))
                    onResultFilterChange('exact')
                  }}
                >
                  Выделить совпадения ({count(matchingRows.length)})
                </ExplainedButton>
                <span className="selection-help">
                  Shift + клик — выделить диапазон. Подтверждаются только записи без решения.
                </span>
              </div>
              {selected.size > 0 && (
                <div className="selection-bar">
                  <span>
                    Выбрано {count(selected.size)}
                    {hiddenSelected > 0 && <> · вне выборки {count(hiddenSelected)}</>}
                  </span>
                  <ExplainedButton
                    className="primary"
                    hintLabel="Почему нельзя подтвердить выбранные совпадения"
                    hint="Подтверждаешь только выделенные записи. Название, исполнители и длительность совпадают; это сверка описаний, а не аудио. Группу можно отменить."
                    reason={
                      busy
                        ? 'Дождись завершения текущего действия.'
                        : selectedMatches !== selected.size
                          ? 'Для массового подтверждения выбери записи без решения со статусом «Совпадают данные». Используй кнопку «Выделить совпадения».'
                          : undefined
                    }
                    onClick={() => void confirmSelection()}
                  >
                    <CheckCheck size={14} aria-hidden="true" />
                    Подтвердить выбранные ({count(selectedMatches)})
                  </ExplainedButton>
                  <div
                    className="selection-decisions"
                    role="group"
                    aria-label="Решения для выбранных записей"
                  >
                    <button
                      disabled={!!busy}
                      title="Сбросить решение и вернуть выбранные записи в статус «Нужен выбор»"
                      onClick={() =>
                        void onPatch([...selected], {
                          destination: 'unresolved',
                          spotify: null,
                          localPending: false,
                          reviewDeferred: false,
                          local: null,
                          excluded: false,
                        })
                      }
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Сбросить решение
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => void onPatch([...selected], { excluded: true })}
                    >
                      <Ban size={14} aria-hidden="true" />
                      Исключить
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => void onPatch([...selected], { excluded: false })}
                    >
                      <ListPlus size={14} aria-hidden="true" />
                      Вернуть в перенос
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void onPatch([...selected], {
                          destination: 'unresolved',
                          localPending: false,
                          reviewDeferred: true,
                        })
                      }
                    >
                      <Clock size={14} aria-hidden="true" />
                      Разобрать позже
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void onPatch([...selected], {
                          destination: 'unresolved',
                          localPending: true,
                          reviewDeferred: false,
                        })
                      }
                    >
                      <FileAudio size={14} aria-hidden="true" />
                      Нужен локальный файл
                    </button>
                    <button
                      disabled={
                        !!busy ||
                        (data.settings.searchProvider !== 'browser' && !data.spotify.connected)
                      }
                      onClick={() => void onSearch([...selected])}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      Повторить поиск
                    </button>
                  </div>
                  {hiddenSelected > 0 && (
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        const visible = new Set(rows.map((row) => row.id))
                        onSelectedChange(new Set([...selected].filter((id) => visible.has(id))))
                      }}
                    >
                      Оставить только видимые
                    </button>
                  )}
                  <IconButton title="Снять выделение" onClick={() => onSelectedChange(new Set())}>
                    <X size={16} />
                  </IconButton>
                </div>
              )}
              <TrackTable
                rows={rows}
                selected={selected}
                onSelect={onSelectedChange}
                focusedId={focusId}
                onFocus={handleFocusRow}
                onReview={openReviewRow}
                resetKey={`${collectionId}:${query}:${filter}:${resultFilter}`}
                matchingRules={data.settings.matchingRules}
              />
              <footer className="collection-footer">
                <span>
                  {count(rows.length)} из {count(counts.all)} записей
                  {counts.excluded > 0 && (
                    <> · {count(counts.excluded)} исключено, сохранено в списке</>
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
                  draft={drafts[focused.id]}
                  onDraftChange={(draft) =>
                    onDraftsChange((current) => ({ ...current, [focused.id]: draft }))
                  }
                  busy={!!busy}
                  jobs={data.jobs}
                  spotifyConnected={
                    data.settings.searchProvider === 'browser' || data.spotify.connected
                  }
                  onClose={closeInspector}
                  onPatch={(value) => onPatch([focused.id], value)}
                  onLink={() => void onLinkFile(focused.id)}
                  onSearch={() => onSearch([focused.id])}
                  onExternal={onOpenExternal}
                  width={inspector.width}
                  panelRef={inspector.panel}
                  layout={inspector.layout}
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
