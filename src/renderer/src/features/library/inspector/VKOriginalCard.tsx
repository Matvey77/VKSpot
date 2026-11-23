import { Loader2, Pause, Play, ShieldCheck } from 'lucide-react'
import { formatDuration as duration } from '../../../../../core/library'
import type { TrackRow } from '../../../../../shared/types'

export function VKOriginalCard({
  row,
  busy,
  playing,
  loading,
  progress,
  error,
  onTogglePlay,
}: {
  row: TrackRow
  busy: boolean
  playing: boolean
  loading: boolean
  progress: string
  error: string | null
  onTogglePlay: () => void
}) {
  return (
    <div className="inspector-card">
      <h3>
        <ShieldCheck size={15} aria-hidden="true" />
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
      <div className="review-audio-bar">
        <button
          type="button"
          className={`audio-listen-button ${playing ? 'playing' : ''}`}
          disabled={busy || row.source.availability === 'blocked'}
          onClick={onTogglePlay}
          title={
            row.source.availability === 'blocked'
              ? 'Аудиозапись недоступна в VK'
              : loading
                ? 'Отменить поиск оригинала VK'
                : playing
                  ? 'Поставить VK на паузу'
                  : 'Слушать оригинал в VK'
          }
        >
          {loading ? (
            <Loader2 size={14} className="spinning" aria-hidden="true" />
          ) : playing ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          <span>
            {loading ? 'Отменить запуск VK' : playing ? 'Пауза VK' : 'Слушать оригинал VK'}
          </span>
        </button>
        {loading && (
          <span className="helper-text" role="status">
            {progress}
          </span>
        )}
        {playing && (
          <span className="audio-playing-badge">
            <span className="audio-pulse-dot" aria-hidden="true" /> Играет VK
          </span>
        )}
        {error && <span className="audio-error-hint">{error}</span>}
      </div>
      {row.source.availability === 'blocked' && (
        <span className="status-tag blocked">Недоступна в VK</span>
      )}
    </div>
  )
}
