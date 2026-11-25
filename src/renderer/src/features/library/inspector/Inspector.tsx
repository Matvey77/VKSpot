import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileAudio,
  Headphones,
  Link2,
  Loader2,
  Rows2,
  Search,
  X,
} from 'lucide-react'
import type { TrackRow, Working } from '../../../../../shared/types'
import type { JobStatus } from '../../../../../shared/job-status'
import { spotifyTrackId } from '../../../../../core/spotify-link'
import { formatDuration as duration } from '../../../../../core/library'
import { SpotifyIcon } from '../../../components/brand/BrandIcons'
import IconButton from '../../../components/ui/IconButton'
import { draftsStore } from '../../../state/drafts'
import { CandidatesList } from './CandidatesList'
import ManualSpotifyMatch from './ManualSpotifyMatch'
import { SpotifyEmbedPlayer } from './SpotifyEmbedPlayer'
import { useVKAudioPreview } from './useVKAudioPreview'
import { VKOriginalCard } from './VKOriginalCard'
import { WorkingCopyForm } from './WorkingCopyForm'

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])'

function useRowDraftModified(row: TrackRow): boolean {
  const subscribe = useCallback(
    (listener: () => void) => draftsStore.subscribe(row.id, listener),
    [row.id],
  )
  const getSnapshot = useCallback(() => {
    const draft = draftsStore.get(row.id)
    if (!draft) return false
    return (
      draft.artist !== row.working.artist ||
      draft.title !== row.working.title ||
      draft.version !== row.working.version ||
      draft.note !== row.working.note
    )
  }, [row.id, row.working])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function Inspector({
  row,
  busy,
  jobs,
  spotifyConnected,
  onClose,
  onPatch,
  onLink,
  onSearch,
  onExternal,
  width,
  panelRef,
  layout = 'parallel',
  isOverlay = false,
  onLayoutChange,
  onPrevious,
  onNext,
}: {
  row: TrackRow
  busy: boolean
  jobs: JobStatus[]
  spotifyConnected: boolean
  onClose: () => void
  onPatch: (p: Partial<Working>) => Promise<boolean>
  onLink: () => void
  onSearch: () => Promise<string | undefined>
  onExternal: (url: string) => void
  width?: number
  panelRef?: RefObject<HTMLElement | null>
  layout?: 'parallel' | 'sequential'
  isOverlay?: boolean
  onLayoutChange?: (mode: 'parallel' | 'sequential') => void
  onPrevious?: () => void
  onNext?: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const localPanelRef = useRef<HTMLElement>(null)
  const setAsideRef = useCallback(
    (node: HTMLElement | null) => {
      localPanelRef.current = node
      if (panelRef) panelRef.current = node
    },
    [panelRef],
  )

  useLayoutEffect(() => heading.current?.focus({ preventScroll: true }), [])

  const [startingSearch, setStartingSearch] = useState(false)
  const [searchId, setSearchId] = useState<string>()
  const searchJob = jobs.find((job) => job.id === searchId)
  const searching =
    startingSearch || searchJob?.state === 'running' || searchJob?.state === 'pausing'

  const handleSearch = async () => {
    setStartingSearch(true)
    setSearchId(undefined)
    try {
      setSearchId(await onSearch())
    } finally {
      setStartingSearch(false)
    }
  }

  const excluded = row.working.excluded
  const modified = useRowDraftModified(row)
  const [playingSpotifyId, setPlayingSpotifyId] = useState<string | null>(null)
  const [manualPreview, setManualPreview] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  useEffect(() => {
    setPlayingSpotifyId(null)
    setManualPreview(false)
    setManualOpen(false)
  }, [row.id])

  const vkAudio = useVKAudioPreview(row, () => {
    setManualPreview(false)
    setPlayingSpotifyId(null)
  })

  const handleToggleSpotify = (trackId: string) => {
    setManualPreview(false)
    void vkAudio.stop()
    setPlayingSpotifyId((prev) => (prev === trackId ? null : trackId))
  }

  const chosenSpotifyId = row.working.spotify
    ? spotifyTrackId(row.working.spotify.uri || row.working.spotify.url)
    : null

  const vkOriginalSection = (
    <VKOriginalCard
      row={row}
      busy={busy}
      playing={vkAudio.playing}
      loading={vkAudio.loading}
      progress={vkAudio.progress}
      error={vkAudio.error}
      volume={vkAudio.volume}
      onVolumeChange={vkAudio.setVolume}
      onToggleMute={vkAudio.toggleMute}
      onTogglePlay={() => void vkAudio.toggle()}
    />
  )

  const vkWorkSection = <WorkingCopyForm row={row} busy={busy} onPatch={onPatch} />

  const spotifyMatchSection = (
    <div className="inspector-card">
      <h3>
        <SpotifyIcon size={17} /> Версия для переноса
      </h3>
      <p className="destination-state">
        Текущее назначение:{' '}
        <strong>
          {row.working.destination === 'spotify'
            ? 'Spotify'
            : row.working.destination === 'local'
              ? 'локальный файл'
              : row.working.localPending
                ? 'локальный файл (ожидает привязки)'
                : row.working.reviewDeferred
                  ? 'разобрать позже'
                  : 'не выбрано'}
        </strong>
      </p>
      <div className="button-row inspector-action-row">
        <button
          type="button"
          disabled={busy || searching || !spotifyConnected || modified || excluded}
          onClick={() => void handleSearch()}
        >
          {searching ? (
            <Loader2 size={15} className="spinning" aria-hidden="true" />
          ) : (
            <Search size={15} aria-hidden="true" />
          )}
          {searching ? 'Поиск в Spotify…' : 'Найти в Spotify'}
        </button>
        <button
          type="button"
          disabled={busy || modified || excluded}
          aria-expanded={manualOpen}
          onClick={() => {
            setManualOpen(!manualOpen)
            setManualPreview(false)
          }}
        >
          <Link2 size={15} aria-hidden="true" />
          Указать трек Spotify
        </button>
      </div>
      {(startingSearch || searchJob) && (
        <p className="helper-text" role="status">
          {searching
            ? 'Запрашиваем актуальные варианты в Spotify…'
            : searchJob?.state === 'complete'
              ? `Поиск завершён. Найдено вариантов: ${row.working.candidates.length}.`
              : searchJob?.message}
        </p>
      )}
      <ManualSpotifyMatch
        key={`${row.working.artist}:${row.working.title}`}
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        row={row}
        disabled={busy || modified || excluded}
        preview={manualPreview}
        onPreviewChange={setManualPreview}
        onPatch={onPatch}
        onPreview={() => {
          void vkAudio.stop()
          setPlayingSpotifyId(null)
        }}
      />
      <div className="button-row inspector-action-row">
        <button type="button" disabled={busy} onClick={onLink}>
          <FileAudio size={15} aria-hidden="true" />
          Привязать файл
        </button>
      </div>

      {row.working.spotify && (
        <div
          className={
            row.working.destination === 'spotify' ? 'chosen-match' : 'chosen-match retained-match'
          }
        >
          <CheckCheck size={17} aria-hidden="true" />
          <div>
            <small>
              {row.working.destination === 'spotify'
                ? 'Выбран Spotify'
                : 'Сохранённый вариант Spotify'}
            </small>
            <strong>{row.working.spotify.title}</strong>
            <span>{row.working.spotify.artists.join(', ')}</span>
            <small className="chosen-match-meta">
              {row.working.spotify.album} · {duration(row.working.spotify.duration)}
            </small>
            {row.working.destination !== 'spotify' && (
              <button
                className="chosen-match-use-btn"
                disabled={busy || modified}
                onClick={() => void onPatch({ destination: 'spotify' })}
              >
                Использовать Spotify
              </button>
            )}
            {chosenSpotifyId && (
              <div className="chosen-match-audio-actions">
                <button
                  type="button"
                  className={`audio-listen-button ${playingSpotifyId === chosenSpotifyId ? 'active' : ''}`}
                  disabled={busy}
                  onClick={() => handleToggleSpotify(chosenSpotifyId)}
                >
                  <Headphones size={14} aria-hidden="true" />
                  <span>
                    {playingSpotifyId === chosenSpotifyId ? 'Скрыть' : 'Слушать в Spotify'}
                  </span>
                </button>
                <IconButton
                  title="Открыть в браузере"
                  onClick={() => onExternal(row.working.spotify!.url)}
                >
                  <ArrowRight size={14} aria-hidden="true" />
                </IconButton>
              </div>
            )}
            {chosenSpotifyId && playingSpotifyId === chosenSpotifyId && (
              <SpotifyEmbedPlayer
                trackId={chosenSpotifyId}
                title={`Spotify: ${row.working.spotify.title}`}
              />
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
          <button disabled={busy} onClick={() => void onPatch({ destination: 'local' })}>
            Использовать локальный файл
          </button>
        </div>
      )}

      <CandidatesList
        row={row}
        busy={busy}
        modified={modified}
        searching={searching}
        playingSpotifyId={playingSpotifyId}
        onToggleSpotify={handleToggleSpotify}
        onSelectCandidate={(candidate) => onPatch({ spotify: candidate, destination: 'spotify' })}
        onExternal={onExternal}
      />
    </div>
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation()
      onClose()
      return
    }
    if (isOverlay && event.key === 'Tab') {
      const container = localPanelRef.current
      if (!container) return
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || active === heading.current || !container.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <aside
      ref={setAsideRef}
      role={isOverlay ? 'dialog' : undefined}
      aria-modal={isOverlay ? true : undefined}
      className={`inspector ${layout === 'parallel' ? 'layout-parallel' : 'layout-sequential'}`}
      aria-label={`Разбор записи ${row.position}`}
      onKeyDown={handleKeyDown}
      style={width ? { width: `${width}px` } : undefined}
    >
      <div className="inspector-heading">
        <div className="inspector-track-heading">
          <span>Запись №{row.position}</span>
          <h2 ref={heading} tabIndex={-1} title={row.working.title}>
            {row.working.title || 'Без названия'}
          </h2>
          <p>{row.working.artist || 'Без исполнителя'}</p>
        </div>
        <div className="inspector-heading-controls">
          <div
            className="inspector-track-navigation"
            role="group"
            aria-label="Переход между записями"
          >
            <IconButton
              data-inspector-action="prev"
              title="Предыдущая запись"
              disabled={!onPrevious}
              onClick={() => onPrevious?.()}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </IconButton>
            <IconButton
              data-inspector-action="next"
              title="Следующая запись"
              disabled={!onNext}
              onClick={() => onNext?.()}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </IconButton>
          </div>
          {onLayoutChange && (
            <div className="inspector-layout-toggle" role="group" aria-label="Расположение блоков">
              <button
                type="button"
                className={`layout-icon-btn ${layout === 'parallel' ? 'active' : ''}`}
                title="Параллельное отображение (VK и Spotify рядом)"
                aria-pressed={layout === 'parallel'}
                onClick={() => onLayoutChange('parallel')}
              >
                <Columns2 size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`layout-icon-btn ${layout === 'sequential' ? 'active' : ''}`}
                title="Последовательное отображение (друг под другом)"
                aria-pressed={layout === 'sequential'}
                onClick={() => onLayoutChange('sequential')}
              >
                <Rows2 size={15} aria-hidden="true" />
              </button>
            </div>
          )}
          <IconButton data-inspector-action="close" title="Закрыть запись" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
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
            <section className="inspector-section">{spotifyMatchSection}</section>
            <section className="inspector-section">{vkWorkSection}</section>
          </div>
        )}
      </div>
    </aside>
  )
}
