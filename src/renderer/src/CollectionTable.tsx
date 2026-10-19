import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  CheckCheck,
  Columns2,
  FileAudio,
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Rows2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MatchingRules, TrackRow, Working } from '../../shared/model'
import { defaultMatchingRules } from '../../shared/model'
import { reviewGroup, reviewLabels, spotifyTrackId } from '../../core/matching'
import { SpotifyIcon } from './BrandIcons'

type Draft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>
type Filter = 'all' | 'unresolved' | 'spotify' | 'local' | 'local-pending' | 'excluded' | 'blocked'
const labels: Record<Filter, string> = {
  all: 'Все записи',
  unresolved: 'Нужен выбор',
  spotify: 'Spotify',
  local: 'Локальные',
  'local-pending': 'Нужен локальный файл',
  excluded: 'Исключённые',
  blocked: 'Недоступные в VK',
}
const duration = (seconds: number | null) =>
  seconds === null
    ? '—'
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
function status(row: TrackRow): Filter {
  return row.working.excluded
    ? 'excluded'
    : row.working.localPending && row.working.destination === 'unresolved'
      ? 'local-pending'
      : row.working.destination
}
function IconButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="icon-button"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

const column = createColumnHelper<TrackRow>()
export function TrackTable({
  rows,
  selected,
  onSelect,
  focusedId,
  onFocus,
  onReview,
  resetKey,
  matchingRules = defaultMatchingRules,
}: {
  rows: TrackRow[]
  selected: Set<string>
  onSelect: (set: Set<string>) => void
  focusedId: string
  onFocus: (id: string) => void
  onReview: (id: string) => void
  resetKey: string
  matchingRules?: MatchingRules
}) {
  const container = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const saved = localStorage.getItem('vkspot_column_sizing')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('vkspot_column_sizing', JSON.stringify(columnSizing))
    } catch {
      /* ignore */
    }
  }, [columnSizing])

  const columns = useMemo(
    () => [
      column.display({
        id: 'select',
        size: 38,
        minSize: 38,
        maxSize: 50,
        enableResizing: false,
        header: () => (
          <input
            type="checkbox"
            aria-label="Выделить все записи выборки"
            checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
            ref={(element) => {
              if (element)
                element.indeterminate =
                  rows.some((row) => selected.has(row.id)) &&
                  !rows.every((row) => selected.has(row.id))
            }}
            onChange={(e) =>
              onSelect(
                e.target.checked
                  ? new Set([...selected, ...rows.map((r) => r.id)])
                  : new Set([...selected].filter((id) => !rows.some((r) => r.id === id))),
              )
            }
          />
        ),
        cell: (info) => (
          <input
            type="checkbox"
            aria-label={`Выбрать запись ${info.row.original.position}`}
            checked={selected.has(info.row.original.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = new Set(selected)
              if (e.target.checked) next.add(info.row.original.id)
              else next.delete(info.row.original.id)
              onSelect(next)
            }}
          />
        ),
      }),
      column.accessor('position', {
        header: '№',
        size: 52,
        minSize: 36,
        maxSize: 100,
        cell: (info) => <span className="position">{info.getValue()}</span>,
      }),
      column.display({
        id: 'title',
        header: 'Запись',
        size: 380,
        minSize: 140,
        maxSize: 1200,
        cell: (info) => {
          const r = info.row.original
          return (
            <div className="track-title">
              <strong>
                {r.working.title || 'Без названия'}
                {r.working.version && <span className="version-label">{r.working.version}</span>}
              </strong>
              <span>
                {r.working.artist || 'Без исполнителя'}
                {r.source.availability === 'blocked' && (
                  <span className="blocked-text"> · недоступна в VK</span>
                )}
              </span>
            </div>
          )
        },
      }),
      column.display({
        id: 'result',
        header: 'Результат поиска',
        size: 158,
        minSize: 100,
        maxSize: 300,
        cell: (info) => (
          <span className={`status-tag result-${reviewGroup(info.row.original, matchingRules)}`}>
            {reviewLabels[reviewGroup(info.row.original, matchingRules)]}
          </span>
        ),
      }),
      column.display({
        id: 'status',
        header: 'Назначение',
        size: 140,
        minSize: 90,
        maxSize: 300,
        cell: (info) => (
          <span className={`status-tag ${status(info.row.original)}`}>
            {labels[status(info.row.original)]}
          </span>
        ),
      }),
      column.display({
        id: 'duration',
        header: 'Время',
        size: 64,
        minSize: 45,
        maxSize: 120,
        cell: (info) => (
          <span className="duration">{duration(info.row.original.source.duration)}</span>
        ),
      }),
      column.display({
        id: 'open',
        header: '',
        size: 32,
        minSize: 32,
        maxSize: 50,
        enableResizing: false,
        cell: (info) =>
          reviewGroup(info.row.original, matchingRules) === 'ready' ? (
            <ArrowRight className="row-arrow" size={15} />
          ) : (
            <button
              className="table-review-button"
              aria-label={`Разобрать запись ${info.row.original.position}`}
              title="Сравнить версии"
              onClick={(event) => {
                event.stopPropagation()
                onReview(info.row.original.id)
              }}
            >
              <ArrowRight size={15} />
            </button>
          ),
      }),
    ],
    [rows, selected, onSelect, onReview, matchingRules],
  )
  const table = useReactTable({
    data: rows,
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })
  const virtual = useVirtualizer({
    count: rows.length,
    getItemKey: (index) => rows[index]?.id ?? index,
    getScrollElement: () => container.current,
    estimateSize: () => 52,
    overscan: 10,
  })
  useEffect(() => {
    virtual.scrollToOffset(0)
  }, [resetKey])

  const hasCustomSizing = Object.keys(columnSizing).length > 0
  const totalTableWidth = hasCustomSizing ? table.getTotalSize() : undefined
  const gridTemplateColumns = hasCustomSizing
    ? table
        .getVisibleLeafColumns()
        .map((c) => `${c.getSize()}px`)
        .join(' ')
    : '38px 48px minmax(130px, 1fr) 158px 140px 62px 32px'

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  return (
    <section
      className="table-panel"
      role="table"
      aria-rowcount={rows.length + 1}
      aria-label="Список музыки"
    >
      <div className="table-header-wrapper" ref={headerRef}>
        <div
          className="table-header"
          role="row"
          style={{
            gridTemplateColumns,
            ...(totalTableWidth ? { width: `${totalTableWidth}px` } : { width: '100%' }),
            minWidth: '100%',
          }}
        >
          {table.getHeaderGroups()[0].headers.map((h) => (
            <div
              key={h.id}
              role="columnheader"
              className={`cell cell-${h.id}`}
              style={{
                ...(hasCustomSizing ? { width: `${h.getSize()}px` } : {}),
                position: 'relative',
              }}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
              {h.column.getCanResize() && (
                <div
                  onMouseDown={h.getResizeHandler()}
                  onTouchStart={h.getResizeHandler()}
                  className={`table-column-resizer ${h.column.getIsResizing() ? 'isResizing' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                  title="Потяните для изменения ширины столбца"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="table-scroll" ref={container} onScroll={handleScroll}>
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
            style={{
              height: virtual.getTotalSize(),
              ...(totalTableWidth ? { width: `${totalTableWidth}px` } : { width: '100%' }),
              minWidth: '100%',
            }}
          >
            {virtual.getVirtualItems().map((item) => {
              const row = table.getRowModel().rows[item.index]
              return (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  aria-label={`Запись ${row.original.position}: ${row.original.working.title}`}
                  onClick={() => onFocus(row.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onFocus(row.id)
                    }
                  }}
                  className={`table-row ${focusedId === row.id ? 'focused' : ''} ${row.original.working.excluded ? 'excluded-row' : ''}`}
                  style={{
                    transform: `translateY(${item.start}px)`,
                    gridTemplateColumns,
                    ...(totalTableWidth ? { width: `${totalTableWidth}px` } : { width: '100%' }),
                    minWidth: '100%',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div role="cell" key={cell.id} className={`cell cell-${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export function Inspector({
  row,
  draft: cachedDraft,
  onDraftChange,
  busy,
  spotifyConnected,
  onClose,
  onPatch,
  onLink,
  onSearch,
  onExternal,
  width,
  layout = 'parallel',
  onLayoutChange,
}: {
  row: TrackRow
  draft?: Draft
  onDraftChange: (draft: Draft) => void
  busy: boolean
  spotifyConnected: boolean
  onClose: () => void
  onPatch: (p: Partial<Working>) => Promise<boolean>
  onLink: () => void
  onSearch: () => void
  onExternal: (url: string) => void
  width?: number
  layout?: 'parallel' | 'sequential'
  onLayoutChange?: (mode: 'parallel' | 'sequential') => void
}) {
  const [excluded, setExcluded] = useState(row.working.excluded)
  useEffect(() => setExcluded(row.working.excluded), [row.id, row.working.excluded])

  const [playingSpotifyId, setPlayingSpotifyId] = useState<string | null>(null)
  const [vkPlaying, setVkPlaying] = useState(false)
  const [vkLoading, setVkLoading] = useState(false)
  const [vkError, setVkError] = useState<string | null>(null)

  useEffect(() => {
    if (vkPlaying) {
      void window.vkspot.pauseVKTrack()
      setVkPlaying(false)
    }
    setPlayingSpotifyId(null)
    setVkError(null)
  }, [row.id])

  useEffect(() => {
    return () => {
      void window.vkspot.pauseVKTrack()
    }
  }, [])

  const handleToggleVK = async () => {
    if (playingSpotifyId) {
      setPlayingSpotifyId(null)
    }
    if (vkPlaying) {
      await window.vkspot.pauseVKTrack()
      setVkPlaying(false)
    } else {
      setVkLoading(true)
      setVkError(null)
      try {
        const res = await window.vkspot.playVKTrack({
          id: row.source.id,
          artist: row.source.artist,
          title: row.source.title,
        })
        setVkLoading(false)
        if (res.ok && res.value.playing) {
          setVkPlaying(true)
        } else if (!res.ok) {
          setVkError(res.error)
        } else if (res.value?.error) {
          setVkError(res.value.error)
        }
      } catch {
        setVkLoading(false)
        setVkError('Не удалось запустить воспроизведение VK')
      }
    }
  }

  const handleToggleSpotify = (trackId: string) => {
    if (vkPlaying) {
      void window.vkspot.pauseVKTrack()
      setVkPlaying(false)
    }
    setPlayingSpotifyId((prev) => (prev === trackId ? null : trackId))
  }

  const draft = cachedDraft ?? {
    artist: row.working.artist,
    title: row.working.title,
    version: row.working.version,
    note: row.working.note,
  }
  const setDraft = onDraftChange
  const modified = Object.entries(draft).some(
    ([key, value]) => value !== row.working[key as keyof typeof draft],
  )

  const hasDecision =
    row.working.destination !== 'unresolved' ||
    row.working.spotify !== null ||
    row.working.local !== null ||
    row.working.localPending ||
    row.working.excluded

  const vkOriginalSection = (
    <div className="inspector-card">
      <h3>
        <ShieldCheck size={15} />
        Оригинал из VK
      </h3>
      <dl>
        <dt>Исполнитель</dt>
        <dd>{row.source.artist || 'Не указан'}</dd>
        <dt>Название</dt>
        <dd>{row.source.title || 'Не указано'}</dd>
        <dt>ID / длительность</dt>
        <dd>
          {row.source.id || 'Нет ID'} · {duration(row.source.duration)}
        </dd>
      </dl>
      <div className="review-audio-bar" style={{ marginTop: '10px' }}>
        <button
          type="button"
          className={`audio-listen-button ${vkPlaying ? 'playing' : ''}`}
          disabled={busy || vkLoading || row.source.availability === 'blocked'}
          onClick={handleToggleVK}
          title={
            row.source.availability === 'blocked'
              ? 'Аудиозапись недоступна в VK'
              : vkPlaying
                ? 'Поставить VK на паузу'
                : 'Слушать оригинал в VK'
          }
        >
          {vkLoading ? (
            <Loader2 size={14} className="spin" />
          ) : vkPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}
          <span>
            {vkLoading ? 'Подключение VK…' : vkPlaying ? 'Пауза VK' : 'Слушать оригинал VK'}
          </span>
        </button>
        {vkPlaying && (
          <span className="audio-playing-badge">
            <span className="audio-pulse-dot" /> Играет VK
          </span>
        )}
        {vkError && <span className="audio-error-hint">{vkError}</span>}
      </div>
      {row.source.availability === 'blocked' && (
        <span className="status-tag blocked">Недоступна в VK</span>
      )}
    </div>
  )

  const vkWorkSection = (
    <div className="inspector-card">
      <h3>Рабочая копия</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onPatch(draft)
        }}
      >
        {(
          [
            { key: 'artist', name: 'Исполнитель' },
            { key: 'title', name: 'Название' },
            { key: 'version', name: 'Версия / авторский тег' },
            { key: 'note', name: 'Заметка' },
          ] as const
        ).map((field) => (
          <label className="field" key={field.key}>
            {field.name}
            <input
              value={draft[field.key]}
              onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
            />
          </label>
        ))}
        <button className="primary full-width" disabled={!modified || busy} type="submit">
          Сохранить правки
          <Check size={15} />
        </button>
      </form>
      {modified && (
        <p className="helper-text" style={{ marginTop: '8px' }}>
          Не забудьте сохранить правки перед повторным поиском.
        </p>
      )}
    </div>
  )

  const spotifyMatchSection = (
    <div className="inspector-card">
      <h3>Сопоставление и варианты</h3>
      <p className="destination-state">
        Текущее назначение:{' '}
        <strong>
          {row.working.destination === 'spotify'
            ? 'Spotify'
            : row.working.destination === 'local'
              ? 'локальный файл'
              : 'не выбрано'}
        </strong>
      </p>
      <div className="button-row" style={{ marginBottom: '12px' }}>
        <button disabled={busy || !spotifyConnected || modified} onClick={onSearch}>
          <Search size={15} />
          Найти в Spotify
        </button>
        <button disabled={busy} onClick={onLink}>
          <FileAudio size={15} />
          Привязать файл
        </button>
      </div>

      {row.working.spotify && (
        <div
          className={
            row.working.destination === 'spotify' ? 'chosen-match' : 'chosen-match retained-match'
          }
        >
          <CheckCheck size={17} />
          <div>
            <small>
              {row.working.destination === 'spotify'
                ? 'Выбран Spotify'
                : 'Сохранённый вариант Spotify'}
            </small>
            <strong>{row.working.spotify.title}</strong>
            <span>{row.working.spotify.artists.join(', ')}</span>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
              {row.working.spotify.album} · {duration(row.working.spotify.duration)}
            </small>
            {row.working.destination !== 'spotify' && (
              <button
                disabled={busy || modified}
                onClick={() => onPatch({ destination: 'spotify' })}
                style={{ marginTop: '6px' }}
              >
                Использовать Spotify
              </button>
            )}
            {spotifyTrackId(row.working.spotify.uri || row.working.spotify.url) && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`audio-listen-button ${playingSpotifyId === spotifyTrackId(row.working.spotify.uri || row.working.spotify.url) ? 'active' : ''}`}
                  disabled={busy}
                  onClick={() =>
                    handleToggleSpotify(
                      spotifyTrackId(row.working.spotify!.uri || row.working.spotify!.url)!,
                    )
                  }
                >
                  <Headphones size={14} />
                  <span>
                    {playingSpotifyId ===
                    spotifyTrackId(row.working.spotify.uri || row.working.spotify.url)
                      ? 'Скрыть'
                      : 'Слушать в Spotify'}
                  </span>
                </button>
                <IconButton
                  title="Открыть в браузере"
                  onClick={() => onExternal(row.working.spotify!.url)}
                >
                  <ArrowRight size={14} />
                </IconButton>
              </div>
            )}
            {playingSpotifyId ===
              spotifyTrackId(row.working.spotify.uri || row.working.spotify.url) && (
              <div className="spotify-embed-card" style={{ marginTop: '8px' }}>
                <iframe
                  src={`https://open.spotify.com/embed/track/${spotifyTrackId(row.working.spotify.uri || row.working.spotify.url)}?utm_source=generator&theme=0`}
                  width="100%"
                  height="152"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  title={`Spotify: ${row.working.spotify.title}`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {row.working.local && (
        <div className="local-info">
          <small>
            {row.working.destination === 'local'
              ? 'Выбран локальный файл'
              : 'Привязанный локальный вариант'}
          </small>
          <strong>
            {row.working.local.codec} ·{' '}
            {row.working.local.bitrate
              ? Math.round(row.working.local.bitrate / 1000) + ' кбит/с'
              : 'битрейт не указан'}
          </strong>
          <span>{row.working.local.path}</span>
          <span>
            Теги: {row.working.local.artist || '—'} — {row.working.local.title || '—'}
          </span>
          <button disabled={busy} onClick={() => onPatch({ destination: 'local' })}>
            Использовать локальный файл
          </button>
        </div>
      )}

      {row.working.candidates.length > 0 && (
        <div className="candidates">
          <h4>
            <SpotifyIcon size={18} />
            Кандидаты ({row.working.candidates.length}) — выбери нужную версию
          </h4>
          {row.working.candidates.map((candidate) => {
            const candTrackId = spotifyTrackId(candidate.uri || candidate.url)
            const isCandPlaying = playingSpotifyId === candTrackId
            return (
              <div className="candidate" key={candidate.uri}>
                <strong>{candidate.title}</strong>
                <span>
                  {candidate.artists.join(', ') || 'Исполнитель не указан'} ·{' '}
                  {duration(candidate.duration)}
                </span>
                <small>{candidate.album}</small>
                {isCandPlaying && candTrackId && (
                  <div className="spotify-embed-card" style={{ marginTop: '8px' }}>
                    <iframe
                      src={`https://open.spotify.com/embed/track/${candTrackId}?utm_source=generator&theme=0`}
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      title={`Spotify: ${candidate.title}`}
                    />
                  </div>
                )}
                <div className="button-row">
                  <button
                    disabled={busy || modified}
                    onClick={() => onPatch({ spotify: candidate, destination: 'spotify' })}
                  >
                    <Check size={14} />
                    Выбрать
                  </button>
                  {candTrackId && (
                    <button
                      type="button"
                      className={`audio-listen-button ${isCandPlaying ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => handleToggleSpotify(candTrackId)}
                      title={isCandPlaying ? 'Скрыть плеер' : 'Слушать превью'}
                    >
                      <Headphones size={13} />
                      <span>{isCandPlaying ? 'Пауза' : 'Слушать'}</span>
                    </button>
                  )}
                  <IconButton
                    title="Послушать на сайте Spotify"
                    onClick={() => onExternal(candidate.url)}
                  >
                    <ArrowRight size={15} />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <aside
      className={`inspector ${layout === 'parallel' ? 'layout-parallel' : 'layout-sequential'}`}
      style={width ? { width: `${width}px` } : undefined}
    >
      <div className="inspector-heading">
        <h2>Запись №{row.position}</h2>
        <div className="inspector-heading-controls">
          {onLayoutChange && (
            <div className="inspector-layout-toggle" role="group" aria-label="Расположение блоков">
              <button
                type="button"
                className={`layout-icon-btn ${layout === 'parallel' ? 'active' : ''}`}
                title="Параллельное отображение (VK и Spotify рядом)"
                onClick={() => onLayoutChange('parallel')}
              >
                <Columns2 size={15} />
              </button>
              <button
                type="button"
                className={`layout-icon-btn ${layout === 'sequential' ? 'active' : ''}`}
                title="Последовательное отображение (друг под другом)"
                onClick={() => onLayoutChange('sequential')}
              >
                <Rows2 size={15} />
              </button>
            </div>
          )}
          <IconButton title="Закрыть запись" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </div>

      <div className="inspector-decision-bar">
        <div className="decision-bar-row">
          <div className="decision-status-wrap">
            <span className="decision-title">Решение:</span>
            <span className={`status-tag ${status(row)}`}>{labels[status(row)]}</span>
          </div>
          <div className="decision-actions-wrap">
            {hasDecision && (
              <button
                type="button"
                className="reset-decision-button"
                disabled={busy}
                onClick={() =>
                  onPatch({
                    destination: 'unresolved',
                    spotify: null,
                    localPending: false,
                    local: null,
                    excluded: false,
                  })
                }
                title="Сбросить решение и вернуть трек в статус «Нужен выбор»"
              >
                <RotateCcw size={13} />
                <span>Сбросить решение</span>
              </button>
            )}
            <label
              className="check-field compact-exclude"
              title="Исключить трек из переноса в Spotify"
            >
              <input
                type="checkbox"
                aria-label="Исключить из переноса"
                checked={excluded}
                disabled={busy}
                onChange={async (e) => {
                  const next = e.target.checked
                  setExcluded(next)
                  if (!(await onPatch({ excluded: next }))) setExcluded(row.working.excluded)
                }}
              />
              <span>Исключить из переноса</span>
            </label>
          </div>
        </div>
      </div>

      <div className="inspector-scroll-area">
        {layout === 'parallel' ? (
          <div className="inspector-columns">
            <div className="inspector-column inspector-column-vk">
              <section className="inspector-section">{vkOriginalSection}</section>
              <section className="inspector-section">{vkWorkSection}</section>
            </div>
            <div className="inspector-column inspector-column-spotify">
              <section className="inspector-section">{spotifyMatchSection}</section>
            </div>
          </div>
        ) : (
          <div className="inspector-sequential">
            <section className="inspector-section">{vkOriginalSection}</section>
            <section className="inspector-section">{vkWorkSection}</section>
            <section className="inspector-section">{spotifyMatchSection}</section>
          </div>
        )}
      </div>
    </aside>
  )
}
