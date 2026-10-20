import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FolderOpen,
  Link2,
  ListFilter,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import type { AppState, Collection, Settings, TrackRow, Working } from '../../shared/model'
import { reviewGroup, reviewLabels, type ReviewGroup } from '../../core/matching'
import ExplainedButton from './ExplainedButton'
import IconButton from './IconButton'
import CompletenessNotice from './CompletenessNotice'
import SearchControls from './SearchControls'
import { TrackTable, Inspector } from './CollectionTable'
import { SpotifyIcon, VKIcon } from './BrandIcons'

export type Filter =
  'all' | 'unresolved' | 'spotify' | 'local' | 'local-pending' | 'excluded' | 'blocked'

const labels: Record<Filter, string> = {
  all: 'Все записи',
  unresolved: 'Нужен выбор',
  spotify: 'Spotify',
  local: 'Локальные',
  'local-pending': 'Нужен локальный файл',
  excluded: 'Исключённые',
  blocked: 'Недоступные в VK',
}

const count = (number: number) => number.toLocaleString('ru-RU')

function status(row: TrackRow): Filter {
  return row.working.excluded
    ? 'excluded'
    : row.working.localPending && row.working.destination === 'unresolved'
      ? 'local-pending'
      : row.working.destination
}

export type Draft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>

export interface LibraryViewProps {
  collection: Collection | undefined
  collectionId: string
  data: AppState
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
  resultFilter: 'all' | ReviewGroup
  onResultFilterChange: (rf: 'all' | ReviewGroup) => void
  selected: Set<string>
  onSelectedChange: React.Dispatch<React.SetStateAction<Set<string>>>
  onImportFile: () => void
  onOpenVK: () => void
  onExportArchive: () => void
  onTransferClick: () => void
  onUndo: () => void
  onAutoResumeChange: (val: boolean) => void
  onOpenSpotifyPanel: (jobId?: string) => void
  onContinueSearch: (id: string, browser: boolean) => void
  onSearch: (ids: string[], background?: boolean) => void
  onControlJob: (id: string, action: 'pause' | 'resume') => void
  onPatch: (ids: string[], value: Partial<Working>) => Promise<boolean>
  onConfirmMetadata: (ids: string[]) => Promise<boolean>
  onLinkFile: (rowId: string) => Promise<boolean>
  onOpenExternal: (url: string) => void
  onSaveSettings: (settings: Settings) => void
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
  onExportArchive,
  onTransferClick,
  onUndo,
  onAutoResumeChange,
  onOpenSpotifyPanel,
  onContinueSearch,
  onSearch,
  onControlJob,
  onPatch,
  onConfirmMetadata,
  onLinkFile,
  onOpenExternal,
  onSaveSettings,
  onBackToOverview,
}: LibraryViewProps) {
  const [inspectorLayout, setInspectorLayout] = useState<'parallel' | 'sequential'>(() => {
    const saved = localStorage.getItem('vkspot_inspector_layout')
    return (saved as 'parallel' | 'sequential') || 'parallel'
  })
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const saved = localStorage.getItem('vkspot_inspector_width')
    return saved ? Number(saved) : 660
  })

  const handleLayoutChange = useCallback(
    (mode: 'parallel' | 'sequential') => {
      setInspectorLayout(mode)
      localStorage.setItem('vkspot_inspector_layout', mode)
      if (mode === 'sequential' && inspectorWidth > 500) {
        setInspectorWidth(380)
        localStorage.setItem('vkspot_inspector_width', '380')
      } else if (mode === 'parallel' && inspectorWidth < 550) {
        setInspectorWidth(660)
        localStorage.setItem('vkspot_inspector_width', '660')
      }
    },
    [inspectorWidth],
  )

  const isDraggingRef = useRef(false)
  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = inspectorWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startX - moveEvent.clientX
      const newWidth = Math.min(Math.max(340, startWidth + delta), window.innerWidth - 380)
      setInspectorWidth(newWidth)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setInspectorWidth((w) => {
        localStorage.setItem('vkspot_inspector_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const focused = collection?.rows.find((r) => r.id === focusId)

  const reviewCacheRef = useRef<Map<string, { workingRef: Working; group: ReviewGroup }>>(new Map())
  const prevRulesRef = useRef(data.settings.matchingRules)

  const reviewStates = useMemo(() => {
    if (prevRulesRef.current !== data.settings.matchingRules) {
      reviewCacheRef.current.clear()
      prevRulesRef.current = data.settings.matchingRules
    }
    const cache = reviewCacheRef.current
    const rules = data.settings.matchingRules
    const map = new Map<string, ReviewGroup>()
    if (!collection?.rows) return map
    for (const row of collection.rows) {
      const cached = cache.get(row.id)
      if (cached && cached.workingRef === row.working) {
        map.set(row.id, cached.group)
      } else {
        const group = reviewGroup(row, rules)
        cache.set(row.id, { workingRef: row.working, group })
        map.set(row.id, group)
      }
    }
    return map
  }, [collection, data.settings.matchingRules])

  const baseRows = useMemo(() => {
    if (!collection?.rows) return []
    const trimmed = query.trim().toLocaleLowerCase()
    return collection.rows.filter((row) => {
      const inFilter =
        filter === 'all' ||
        (filter === 'blocked' ? row.source.availability === 'blocked' : status(row) === filter)
      if (!inFilter) return false
      if (!trimmed) return true
      return (
        row.working.artist.toLocaleLowerCase().includes(trimmed) ||
        row.working.title.toLocaleLowerCase().includes(trimmed) ||
        (row.working.version && row.working.version.toLocaleLowerCase().includes(trimmed)) ||
        row.source.artist.toLocaleLowerCase().includes(trimmed) ||
        row.source.title.toLocaleLowerCase().includes(trimmed) ||
        (row.source.id && row.source.id.toLocaleLowerCase().includes(trimmed)) ||
        (row.working.note && row.working.note.toLocaleLowerCase().includes(trimmed))
      )
    })
  }, [collection, query, filter])

  const rows = useMemo(
    () =>
      baseRows.filter((row) => resultFilter === 'all' || reviewStates.get(row.id) === resultFilter),
    [baseRows, resultFilter, reviewStates],
  )

  const resultCounts = useMemo(() => {
    const countsMap: Record<ReviewGroup, number> = {
      pending: 0,
      exact: 0,
      review: 0,
      missing: 0,
      'local-pending': 0,
      deferred: 0,
      ready: 0,
    }
    baseRows.forEach((row) => countsMap[reviewStates.get(row.id)!]++)
    return countsMap
  }, [baseRows, reviewStates])

  const searchCounts = useMemo(() => {
    const result = { pending: 0, resolved: 0 }
    for (const row of collection?.rows ?? []) {
      const group = reviewStates.get(row.id)
      if (group === 'pending') result.pending++
      if (group === 'ready') result.resolved++
    }
    return result
  }, [collection, reviewStates])

  const matchingRows = useMemo(
    () => baseRows.filter((row) => reviewStates.get(row.id) === 'exact'),
    [baseRows, reviewStates],
  )

  const selectedRows = useMemo(
    () => collection?.rows.filter((row) => selected.has(row.id)) ?? [],
    [collection, selected],
  )
  const selectedMatches = selectedRows.filter((row) => reviewStates.get(row.id) === 'exact')
  const hiddenSelected = selected.size - rows.filter((row) => selected.has(row.id)).length

  const confirmSelection = async () => {
    const ids = [...selected]
    const ok = await onConfirmMetadata(ids)
    if (ok) {
      const applied = new Set(ids)
      onSelectedChange((current) => new Set([...current].filter((id) => !applied.has(id))))
    }
  }

  const openReviewRow = (id: string) => {
    onFocusIdChange(id)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          {onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted)',
                background: 'transparent',
                border: 'none',
                padding: '0 0 6px 0',
                cursor: 'pointer',
              }}
            >
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
        {!collection && (
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
          <div
            className="library-mode"
            style={{ justifyContent: 'flex-end', marginBottom: '12px' }}
          >
            <div className="button-row library-actions">
              <button
                onClick={onExportArchive}
                disabled={!!busy}
                aria-label="Сохранить архив"
                title="Сохранить архив"
              >
                <Download size={16} />
                <span className="desktop-label">Сохранить архив</span>
              </button>
              <ExplainedButton
                hintLabel="Перенос в Spotify"
                hint={
                  data.spotify.connected
                    ? 'Проверить состав и создать приватный плейлист.'
                    : 'Для создания плейлиста подключи Spotify API. Поиск через страницу работает отдельно.'
                }
                reason={busy ? 'Дождись завершения текущего действия.' : undefined}
                onClick={onTransferClick}
              >
                {data.spotify.connected ? 'Проверить перенос' : 'Подключить для переноса'}{' '}
                <ArrowRight size={16} />
              </ExplainedButton>
              <IconButton title="Отменить последнюю правку" disabled={!!busy} onClick={onUndo}>
                <Undo2 size={18} />
              </IconButton>
            </div>
          </div>
          <div className="library-panel">
            <div className="table-workspace">
              <SearchControls
                compact
                collectionId={collection.id}
                jobs={data.jobs}
                busy={!!busy}
                connected={data.settings.searchProvider === 'browser' || data.spotify.connected}
                provider={data.settings.searchProvider}
                onProvider={(searchProvider) =>
                  onSaveSettings({ ...data.settings, searchProvider })
                }
                onOpenBrowser={() => onOpenSpotifyPanel()}
                onBrowserResume={(id) => onContinueSearch(id, true)}
                pending={searchCounts.pending}
                resolved={searchCounts.resolved}
                total={collection.rows.length}
                autoResume={data.settings.autoResumeSearch}
                onAutoResume={onAutoResumeChange}
                onStart={() =>
                  onSearch(
                    collection.rows
                      .filter((row) => reviewStates.get(row.id) === 'pending')
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
                <div className="filter-select">
                  <ListFilter size={16} />
                  <select
                    aria-label="Статус записей"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value as Filter)}
                  >
                    {Object.entries(labels).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name} ({count(counts[key as Filter])})
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  aria-label="Результат поиска"
                  value={resultFilter}
                  onChange={(event) =>
                    onResultFilterChange(event.target.value as typeof resultFilter)
                  }
                >
                  <option value="all">Все результаты ({count(baseRows.length)})</option>
                  {Object.entries(reviewLabels).map(([group, label]) => (
                    <option key={group} value={group}>
                      {label} ({count(resultCounts[group as ReviewGroup])})
                    </option>
                  ))}
                </select>
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
                        : selectedMatches.length !== selected.size
                          ? 'Для массового подтверждения выбери только записи «Совпадают данные». Используй кнопку «Выделить совпадения».'
                          : undefined
                    }
                    onClick={() => void confirmSelection()}
                  >
                    Подтвердить выбранные ({count(selectedMatches.length)})
                  </ExplainedButton>
                  <select
                    aria-label="Действие с выбранными"
                    value=""
                    disabled={!!busy}
                    onChange={(event) => {
                      if (event.target.value === 'exclude')
                        void onPatch([...selected], { excluded: true })
                      if (event.target.value === 'include')
                        void onPatch([...selected], { excluded: false })
                      if (event.target.value === 'defer')
                        void onPatch([...selected], { reviewDeferred: true })
                      if (event.target.value === 'local')
                        void onPatch([...selected], { localPending: true, reviewDeferred: false })
                      if (event.target.value === 'search') onSearch([...selected])
                    }}
                  >
                    <option value="" disabled>
                      Другие действия
                    </option>
                    <option value="exclude">Исключить</option>
                    <option value="include">Вернуть в перенос</option>
                    <option value="defer">Разобрать позже</option>
                    <option value="local">Нужен локальный файл</option>
                    <option
                      value="search"
                      disabled={
                        data.settings.searchProvider !== 'browser' && !data.spotify.connected
                      }
                    >
                      Повторить поиск
                    </option>
                  </select>
                  <IconButton title="Снять выделение" onClick={() => onSelectedChange(new Set())}>
                    <X size={16} />
                  </IconButton>
                </div>
              )}
              <div className={`collection-work ${focused ? 'with-inspector' : ''}`}>
                <TrackTable
                  rows={rows}
                  selected={selected}
                  onSelect={onSelectedChange}
                  focusedId={focusId}
                  onFocus={onFocusIdChange}
                  onReview={openReviewRow}
                  resetKey={`${collectionId}:${query}:${filter}:${resultFilter}`}
                  matchingRules={data.settings.matchingRules}
                />
                {focused && (
                  <>
                    <div
                      className="inspector-resizer"
                      onMouseDown={handleInspectorResizeStart}
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
                      spotifyConnected={
                        data.settings.searchProvider === 'browser' || data.spotify.connected
                      }
                      onClose={() => onFocusIdChange('')}
                      onPatch={(value) => onPatch([focused.id], value)}
                      onLink={() => void onLinkFile(focused.id)}
                      onSearch={() => onSearch([focused.id])}
                      onExternal={onOpenExternal}
                      width={inspectorWidth}
                      layout={inspectorLayout}
                      onLayoutChange={handleLayoutChange}
                    />
                  </>
                )}
              </div>
              <footer className="collection-footer">
                <span>
                  {count(rows.length)} из {count(counts.all)} записей · {count(counts.excluded)}{' '}
                  исключено, сохранено в списке
                </span>
              </footer>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default LibraryView
