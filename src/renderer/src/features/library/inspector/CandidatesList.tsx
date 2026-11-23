import { ArrowRight, Check, Headphones, Search } from 'lucide-react'
import { formatDuration as duration } from '../../../../../core/library'
import { spotifyTrackId } from '../../../../../core/spotify-link'
import type { SpotifyTrack, TrackRow } from '../../../../../shared/types'
import { SpotifyIcon } from '../../../components/brand/BrandIcons'
import IconButton from '../../../components/ui/IconButton'
import { SpotifyEmbedPlayer } from './SpotifyEmbedPlayer'

export function CandidatesList({
  row,
  busy,
  modified,
  searching,
  playingSpotifyId,
  onToggleSpotify,
  onSelectCandidate,
  onExternal,
}: {
  row: TrackRow
  busy: boolean
  modified: boolean
  searching: boolean
  playingSpotifyId: string | null
  onToggleSpotify: (trackId: string) => void
  onSelectCandidate: (candidate: SpotifyTrack) => Promise<boolean> | void
  onExternal: (url: string) => void
}) {
  if (row.working.candidates.length > 0) {
    return (
      <div className="candidates">
        <h4>
          <SpotifyIcon size={18} />
          Варианты Spotify <span>{row.working.candidates.length}</span>
        </h4>
        {row.working.candidates.map((candidate) => {
          const candTrackId = spotifyTrackId(candidate.uri || candidate.url)
          const isCandPlaying = playingSpotifyId === candTrackId
          const isChosen =
            row.working.destination === 'spotify' && row.working.spotify?.uri === candidate.uri
          return (
            <div className={`candidate ${isChosen ? 'candidate-chosen' : ''}`} key={candidate.uri}>
              <strong>{candidate.title}</strong>
              <span>
                {candidate.artists.join(', ') || 'Исполнитель не указан'} ·{' '}
                {duration(candidate.duration)}
              </span>
              <small>{candidate.album}</small>
              {isCandPlaying && candTrackId && (
                <SpotifyEmbedPlayer trackId={candTrackId} title={`Spotify: ${candidate.title}`} />
              )}
              <div className="button-row">
                <button
                  disabled={busy || modified}
                  onClick={() => void onSelectCandidate(candidate)}
                >
                  <Check size={14} aria-hidden="true" />
                  {isChosen ? 'Выбрано' : 'Выбрать'}
                </button>
                {candTrackId && (
                  <button
                    type="button"
                    className={`audio-listen-button ${isCandPlaying ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => onToggleSpotify(candTrackId)}
                    title={isCandPlaying ? 'Скрыть плеер' : 'Слушать превью'}
                  >
                    <Headphones size={13} aria-hidden="true" />
                    <span>{isCandPlaying ? 'Пауза' : 'Слушать'}</span>
                  </button>
                )}
                <IconButton
                  title="Послушать на сайте Spotify"
                  onClick={() => onExternal(candidate.url)}
                >
                  <ArrowRight size={15} aria-hidden="true" />
                </IconButton>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (!searching && !row.working.spotify) {
    return (
      <div className="candidate-empty">
        <Search size={22} aria-hidden="true" />
        <strong>
          {row.working.searchedQuery
            ? 'По этому запросу ничего не найдено'
            : 'Найдём эту запись в Spotify'}
        </strong>
        {row.working.searchedQuery ? (
          <>
            <p className="last-search-query">
              Последний запрос: <span>{row.working.searchedQuery}</span>
            </p>
            <p>
              Пустой ответ не означает, что трека нет в Spotify. Повтори поиск или измени
              исполнителя и название в рабочей копии. Можно также указать ссылку или выбрать решение
              «Нужен локальный файл».
            </p>
          </>
        ) : (
          <p>Запусти поиск, укажи ссылку на трек или выбери решение «Нужен локальный файл».</p>
        )}
      </div>
    )
  }

  return null
}
