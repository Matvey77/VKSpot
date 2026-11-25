import type { CSSProperties } from 'react'
import { Loader2, Pause, Play, ShieldCheck, Volume1, Volume2, VolumeX } from 'lucide-react'
import { formatDuration as duration } from '../../../../../core/library'
import type { TrackRow } from '../../../../../shared/types'

export function VKOriginalCard({
  row,
  busy,
  playing,
  loading,
  progress,
  error,
  volume,
  onVolumeChange,
  onToggleMute,
  onTogglePlay,
}: {
  row: TrackRow
  busy: boolean
  playing: boolean
  loading: boolean
  progress: string
  error: string | null
  volume: number
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
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
              ? 'Запись недоступна в VK'
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
        <div className="audio-volume-control" role="group" aria-label="Громкость оригинала VK">
          <button
            type="button"
            className="audio-volume-mute"
            aria-label={volume === 0 ? 'Включить звук VK' : 'Выключить звук VK'}
            aria-pressed={volume === 0}
            title={volume === 0 ? 'Включить звук VK' : 'Выключить звук VK'}
            onClick={onToggleMute}
          >
            {volume === 0 ? (
              <VolumeX size={14} aria-hidden="true" />
            ) : volume < 50 ? (
              <Volume1 size={14} aria-hidden="true" />
            ) : (
              <Volume2 size={14} aria-hidden="true" />
            )}
          </button>
          <input
            type="range"
            className="audio-volume-slider"
            min={0}
            max={100}
            step={1}
            value={volume}
            aria-label="Громкость VK"
            aria-valuetext={`${volume}%`}
            style={{ '--volume-percent': `${volume}%` } as CSSProperties}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
          <span className="audio-volume-value" aria-hidden="true">
            {volume}%
          </span>
        </div>
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
