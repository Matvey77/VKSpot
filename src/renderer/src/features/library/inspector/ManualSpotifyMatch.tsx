import { useId, useState } from 'react'
import { Headphones, Link2 } from 'lucide-react'
import { manualSpotifyTrack, parseSpotifyTrackLink } from '../../../../../core/spotify-link'
import { formatDuration } from '../../../../../core/library'
import type { TrackRow, Working } from '../../../../../shared/model'

export default function ManualSpotifyMatch({
  row,
  disabled,
  preview,
  onPreviewChange: setPreview,
  onPatch,
  onPreview,
}: {
  row: TrackRow
  disabled: boolean
  preview: boolean
  onPreviewChange: (preview: boolean) => void
  onPatch: (patch: Partial<Working>) => Promise<boolean>
  onPreview: () => void
}) {
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [title, setTitle] = useState(row.working.title)
  const [artists, setArtists] = useState(row.working.artist)
  const [duration, setDuration] = useState(
    row.source.duration === null ? '' : formatDuration(row.source.duration),
  )
  const [album, setAlbum] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const track = parseSpotifyTrackLink(link)
  const locked = disabled || saving

  return (
    <div className="manual-spotify">
      <button
        type="button"
        disabled={locked}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setPreview(false)
        }}
      >
        <Link2 size={14} /> Указать трек Spotify
      </button>
      {open && (
        <form
          className="manual-spotify-form"
          onSubmit={async (event) => {
            event.preventDefault()
            setError('')
            try {
              const spotify = manualSpotifyTrack({ link, title, artists, duration, album })
              setSaving(true)
              if (
                await onPatch({
                  spotify,
                  destination: 'spotify',
                  localPending: false,
                  reviewDeferred: false,
                })
              ) {
                setPreview(false)
                setOpen(false)
              } else
                setError('Привязка не сохранена. Проверь сообщение приложения и повтори попытку.')
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Не удалось привязать трек. Повтори попытку.',
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          <p className="helper-text">
            Скопируй ссылку на сам трек: Spotify → Поделиться → Скопировать ссылку. Поиск и Spotify
            API для привязки не нужны.
          </p>
          <label className="field">
            Ссылка или URI трека Spotify
            <input
              required
              value={link}
              disabled={locked}
              placeholder="https://open.spotify.com/track/…"
              aria-invalid={!!error && !track}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setLink(event.target.value)
                setError('')
                setPreview(false)
              }}
            />
          </label>
          <button
            type="button"
            disabled={!track || locked}
            onClick={() => {
              if (!preview) onPreview()
              setPreview(!preview)
            }}
          >
            <Headphones size={14} />
            {preview ? 'Скрыть плеер' : 'Проверить в плеере Spotify'}
          </button>
          {preview && track && (
            <iframe
              className="manual-spotify-player"
              src={`https://open.spotify.com/embed/track/${track.id}?theme=0`}
              width="100%"
              height="152"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              title="Проверка трека Spotify по ссылке"
            />
          )}
          <p className="helper-text">
            Описание заполнено из рабочей копии VK. Сверь его с выбранным треком Spotify и при
            необходимости исправь.
          </p>
          <label className="field">
            Название для привязки
            <input
              required
              disabled={locked}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            Исполнители через запятую
            <input
              required
              disabled={locked}
              value={artists}
              onChange={(event) => setArtists(event.target.value)}
            />
          </label>
          <label className="field">
            Длительность в Spotify (м:сс)
            <input
              required
              disabled={locked}
              value={duration}
              placeholder="1:29"
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
          <label className="field">
            Альбом (необязательно)
            <input
              disabled={locked}
              value={album}
              onChange={(event) => setAlbum(event.target.value)}
            />
          </label>
          {error && (
            <p className="manual-spotify-error" id={errorId} role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={locked}>
            {saving ? 'Сохраняем…' : 'Подтвердить этот трек Spotify'}
          </button>
        </form>
      )}
    </div>
  )
}
