import { useEffect, useState, type RefObject } from 'react'
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
import type { TrackRow, Working } from '../../../../../shared/model'
import { spotifyTrackId } from '../../../../../core/matching'
import {
  destinationLabels as labels,
  destinationStatus as status,
  formatDuration as duration,
} from '../../../../../core/library'
import { SpotifyIcon } from '../../../components/brand/BrandIcons'
import IconButton from '../../../components/ui/IconButton'

type Draft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>
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
  panelRef,
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
  panelRef?: RefObject<HTMLElement | null>
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
      ref={panelRef}
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
