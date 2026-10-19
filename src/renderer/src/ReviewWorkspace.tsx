import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileAudio,
  Headphones,
  Loader2,
  Pause,
  Play,
  Search,
} from 'lucide-react'
import {
  candidateEvidence,
  hasVersionHint,
  metadataMatch,
  reviewGroup,
  spotifyTrackId,
  type ReviewGroup,
} from '../../core/matching'
import type { Collection, Job, Working } from '../../shared/model'
import TabList from './TabList'
import SearchControls from './SearchControls'
import ExplainedButton from './ExplainedButton'
import useRetryClock from './useRetryClock'
import { jobMessage, retryDeadline, waitingJob } from '../../shared/job-status'

const groupLabels = {
  exact: 'Совпадают данные',
  review: 'Проверить версии',
  missing: 'Без результатов',
  'local-pending': 'Нужен файл',
  deferred: 'На потом',
} as const
type Tab = keyof typeof groupLabels
const number = (value: number) => value.toLocaleString('ru-RU')
const time = (value: number | null) =>
  value === null
    ? 'Неизвестна'
    : `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`

export default function ReviewWorkspace({
  collection,
  jobs,
  busy,
  connected,
  onSearch,
  onControl,
  onPatch,
  onConfirm,
  onLink,
  onEdit,
  onExternal,
  autoResume,
  onAutoResume,
  initialRowId,
  searchProvider = 'api',
  onOpenBrowser,
  onBrowserResume,
}: {
  autoResume: boolean
  onAutoResume: (value: boolean) => void
  initialRowId?: string
  searchProvider?: 'browser' | 'api'
  onOpenBrowser?: () => void
  onBrowserResume?: (id: string) => void
  collection: Collection
  jobs: Job[]
  busy: boolean
  connected: boolean
  onSearch: (ids: string[], background?: boolean) => void
  onControl: (id: string, action: 'pause' | 'resume') => void
  onPatch: (ids: string[], patch: Partial<Working>) => Promise<boolean>
  onConfirm: (ids: string[]) => Promise<boolean>
  onLink: (id: string) => Promise<boolean>
  onEdit: (id: string) => void
  onExternal: (url: string) => void
}) {
  const groups = useMemo(() => {
    const result: Record<ReviewGroup, Collection['rows']> = {
      pending: [],
      exact: [],
      review: [],
      missing: [],
      'local-pending': [],
      deferred: [],
      ready: [],
    }
    for (const row of collection.rows) result[reviewGroup(row)].push(row)
    return result
  }, [collection])
  const [tab, setTab] = useState<Tab>(() => {
    const initial = collection.rows.find((item) => item.id === initialRowId)
    const group = initial && reviewGroup(initial)
    return group && group in groupLabels ? (group as Tab) : groups.exact.length ? 'exact' : 'review'
  })
  const [focus, setFocus] = useState(initialRowId ?? '')
  const queue = groups[tab]
  const index = Math.max(
    0,
    queue.findIndex((row) => row.id === focus),
  )
  const row = queue[index]
  const container = useRef<HTMLElement>(null)
  const exact = row && metadataMatch(row)
  const candidates = row ? (tab === 'exact' && exact ? [exact] : row.working.candidates) : []
  const job = jobs.find((item) => item.collectionId === collection.id && item.kind === 'search')
  const activeJob = jobs.find((item) => item.state === 'running' || item.state === 'pausing')
  const blockedJob = job && job.state !== 'complete'
  const now = useRetryClock(retryDeadline(jobs))
  const waiting = searchProvider === 'browser' ? undefined : waitingJob(jobs, now)

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
  }, [row?.id])

  useEffect(() => {
    return () => {
      void window.vkspot.pauseVKTrack()
    }
  }, [])

  const handleToggleVK = async () => {
    if (!row) return
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

  const next = () => {
    setFocus(queue[index + 1]?.id ?? queue[index - 1]?.id ?? '')
    requestAnimationFrame(() => {
      const root = container.current
      const comparison = root?.querySelector<HTMLElement>('.review-comparison')
      const navigation = root?.querySelector<HTMLElement>('.review-navigation')
      if (root && comparison && navigation)
        root.scrollTo({ top: Math.max(0, comparison.offsetTop - navigation.offsetHeight) })
      if (document.activeElement === document.body)
        root?.querySelector<HTMLElement>('[role="tabpanel"]')?.focus({ preventScroll: true })
    })
  }
  const act = async (patch: Partial<Working>) => {
    if (row && (await onPatch([row.id], patch))) next()
  }
  const chooseTab = (value: Tab) => {
    setTab(value)
    setFocus('')
    requestAnimationFrame(() => {
      if (document.activeElement === document.body)
        container.current
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true })
    })
  }

  return (
    <section ref={container} className="review-workspace" aria-label="Разбор коллекции">
      <SearchControls
        collectionId={collection.id}
        jobs={jobs}
        busy={busy}
        connected={connected}
        provider={searchProvider}
        onOpenBrowser={onOpenBrowser}
        onBrowserResume={onBrowserResume}
        pending={groups.pending.length}
        resolved={groups.ready.length}
        total={collection.rows.length}
        autoResume={autoResume}
        onAutoResume={onAutoResume}
        onStart={() =>
          onSearch(
            groups.pending.map((item) => item.id),
            true,
          )
        }
        onControl={onControl}
      />
      <TabList
        id="review-groups"
        className="review-groups"
        label="Результаты поиска"
        value={tab}
        onChange={chooseTab}
        tabs={Object.entries(groupLabels).map(([key, label]) => ({
          value: key as Tab,
          label: (
            <>
              {label} <strong>{number(groups[key as Tab].length)}</strong>
            </>
          ),
        }))}
      />
      <div
        id="review-groups-panel"
        role="tabpanel"
        aria-labelledby={`review-groups-tab-${tab}`}
        tabIndex={0}
        className="review-results"
      >
        {tab === 'exact' && groups.exact.length > 0 && (
          <div className="review-bulk">
            <p>
              Единственный кандидат с теми же названием и исполнителями, разница до 2 секунд. Особые
              версии проверяются отдельно. Это сверка описаний, а не аудио.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (await onConfirm(groups.exact.map((item) => item.id))) chooseTab('review')
              }}
            >
              <Check size={16} /> Подтвердить совпадения ({number(groups.exact.length)})
            </button>
          </div>
        )}
        {tab === 'missing' && groups.missing.length > 0 && (
          <div className="review-bulk">
            <p>
              По текущему запросу кандидатов нет. Можно уточнить описание или вручную отложить эту
              группу до поиска файлов.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void onPatch(
                  groups.missing.map((item) => item.id),
                  { localPending: true, reviewDeferred: false, destination: 'unresolved' },
                )
              }
            >
              <FileAudio size={16} /> Нужен файл для всех ({number(groups.missing.length)})
            </button>
          </div>
        )}
        {row ? (
          <>
            <div className="review-navigation">
              <span>
                {groupLabels[tab]} · {number(index + 1)} из {number(queue.length)}
              </span>
              <div className="button-row">
                <button
                  aria-label="Предыдущая запись проверки"
                  disabled={busy || index === 0}
                  onClick={() => setFocus(queue[index - 1].id)}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  aria-label="Следующая запись проверки"
                  disabled={busy || index === queue.length - 1}
                  onClick={() => setFocus(queue[index + 1].id)}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
            <div className="review-comparison">
              <div className="review-source">
                <span className="review-caption">Оригинал VK · запись №{row.position}</span>
                <h3>{row.source.title || 'Название не указано'}</h3>
                <p className="review-artist">{row.source.artist || 'Исполнитель не указан'}</p>
                <p>
                  Длительность: <strong>{time(row.source.duration)}</strong>
                </p>
                <div className="review-audio-bar">
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
                      <Loader2 size={15} className="spin" />
                    ) : vkPlaying ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                    <span>
                      {vkLoading
                        ? 'Подключение VK…'
                        : vkPlaying
                          ? 'Пауза VK'
                          : 'Слушать оригинал VK'}
                    </span>
                  </button>
                  {vkPlaying && (
                    <span className="audio-playing-badge">
                      <span className="audio-pulse-dot" /> Играет VK
                    </span>
                  )}
                  {vkError && <span className="audio-error-hint">{vkError}</span>}
                </div>
                {hasVersionHint(row) && (
                  <p className="review-version-note">
                    Проверь обозначение версии: по тегу нельзя понять, есть ли она в Spotify.
                  </p>
                )}
                {(row.working.title !== row.source.title ||
                  row.working.artist !== row.source.artist) && (
                  <p className="helper-text">
                    Поиск по рабочей копии: {row.working.artist} — {row.working.title}
                  </p>
                )}
                <div className="review-actions">
                  {tab === 'local-pending' ? (
                    <>
                      <p className="helper-text">
                        Файл ещё не привязан. Эта запись останется неготовой к переносу до выбора
                        настоящего файла или версии Spotify.
                      </p>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (await onLink(row.id)) next()
                        }}
                      >
                        <FileAudio size={16} /> Привязать файл
                      </button>
                      <button disabled={busy} onClick={() => void act({ localPending: false })}>
                        Вернуть к проверке
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act({
                            localPending: true,
                            reviewDeferred: false,
                            destination: 'unresolved',
                          })
                        }
                      >
                        <FileAudio size={16} /> Нужен локальный файл
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void act({ reviewDeferred: tab !== 'deferred' })}
                      >
                        {tab === 'deferred' ? 'Вернуть к проверке' : 'Разобрать позже'}
                      </button>
                    </>
                  )}
                  <button disabled={busy} onClick={() => onEdit(row.id)}>
                    Изменить описание
                  </button>
                  <button disabled={busy} onClick={() => void act({ excluded: true })}>
                    Исключить и дальше
                  </button>
                </div>
              </div>
              <div className="review-options" aria-label="Кандидаты текущей записи">
                <h3>Версии в Spotify</h3>
                {candidates.length ? (
                  candidates.map((candidate) => {
                    const evidence = candidateEvidence(row, candidate)
                    const trackId = spotifyTrackId(candidate.uri || candidate.url)
                    const isPreviewing = playingSpotifyId === trackId
                    return (
                      <article className="review-candidate" key={candidate.uri}>
                        <div>
                          <h4>{candidate.title}</h4>
                          <p>
                            {candidate.artists.join(', ') || 'Исполнитель не указан'} ·{' '}
                            {time(candidate.duration)}
                          </p>
                          <small>{candidate.album}</small>
                        </div>
                        <p className="review-evidence">
                          {evidence.artistMatches ? 'Исполнитель совпадает' : 'Другой исполнитель'}{' '}
                          · {evidence.titleMatches ? 'Название совпадает' : 'Название отличается'} ·{' '}
                          {evidence.durationDifference === null
                            ? 'Нет длительности VK'
                            : `Разница ${Math.round(evidence.durationDifference)} с`}
                        </p>
                        {isPreviewing && trackId && (
                          <div className="spotify-embed-card">
                            <iframe
                              src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
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
                            className="primary"
                            disabled={busy}
                            onClick={async () => {
                              const saved =
                                tab === 'exact'
                                  ? await onConfirm([row.id])
                                  : await onPatch([row.id], {
                                      spotify: candidate,
                                      destination: 'spotify',
                                    })
                              if (saved) next()
                            }}
                          >
                            <Check size={15} /> Выбрать и дальше
                          </button>
                          {trackId && (
                            <button
                              type="button"
                              className={`audio-listen-button ${isPreviewing ? 'active' : ''}`}
                              disabled={busy}
                              onClick={() => handleToggleSpotify(trackId)}
                              title={
                                isPreviewing
                                  ? 'Скрыть плеер Spotify'
                                  : 'Прослушать версию в Spotify'
                              }
                            >
                              <Headphones size={15} />
                              <span>{isPreviewing ? 'Скрыть плеер' : 'Слушать в Spotify'}</span>
                            </button>
                          )}
                          <button
                            disabled={busy || !candidate.url}
                            onClick={() => onExternal(candidate.url)}
                            title="Открыть трек на сайте Spotify в браузере"
                          >
                            В браузер <ExternalLink size={14} />
                          </button>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <div className="review-no-results">
                    <p>Кандидатов по этому описанию пока нет.</p>
                    <ExplainedButton
                      reason={
                        busy
                          ? 'Дождись завершения текущего действия.'
                          : waiting
                            ? jobMessage(waiting, now, autoResume)
                            : !connected
                              ? 'Подключи Spotify в разделе «Подключения».'
                              : activeJob
                                ? 'Дождись завершения или приостанови текущее задание.'
                                : undefined
                      }
                      hintLabel="Почему поиск записи недоступен"
                      onClick={() => onSearch([row.id])}
                    >
                      <Search size={16} /> Найти эту запись
                    </ExplainedButton>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="review-empty">
            <Check size={26} />
            <h3>В этой группе записей нет</h3>
            <p>
              {groups.pending.length
                ? waiting
                  ? 'Spotify запросил ожидание. Можно разбирать уже найденные версии в других группах.'
                  : blockedJob
                    ? 'Продолжи уже начатый поиск кнопкой выше. Результаты появятся по мере готовности.'
                    : !connected
                      ? 'Подключи Spotify в разделе «Подключения», затем запусти фоновый поиск.'
                      : 'Запусти фоновый поиск. Результаты появятся здесь по мере готовности.'
                : 'Выбери другую группу, чтобы продолжить разбор коллекции.'}
            </p>
            {groups.review.length > 0 && tab !== 'review' && (
              <button onClick={() => chooseTab('review')}>
                Перейти к проверке версий ({number(groups.review.length)})
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
