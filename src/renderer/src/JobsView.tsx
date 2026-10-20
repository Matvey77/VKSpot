import { Archive, ArrowRight, CheckCheck, History, Pause, Play } from 'lucide-react'
import type { AppState } from '../../shared/model'
import { autoSearch, jobMessage, resumeDisabledReason } from '../../shared/job-status'
import ExplainedButton from './ExplainedButton'
import { PlaylistRecovery } from './SettingsForms'

const count = (number: number) => number.toLocaleString('ru-RU')

export interface JobsViewProps {
  data: AppState
  busy: string
  jobNow: number
  onArchiveFinishedJobs: () => void
  onArchiveJob: (id: string) => void
  onPauseJob: (id: string) => void
  onResumeJob: (id: string) => void
  onContinueSearchInBrowser: (id: string) => void
  onOpenSpotifyPanel: (jobId: string) => void
  onOpenPlaylist: (playlistId: string) => void
  onReconcileMixed: (id: string) => void
  onRecoverPlaylist: (jobId: string, playlistId: string) => void
  onSetAutoResume: (enabled: boolean) => void
  onGoToLibrary: () => void
}

export function JobsView({
  data,
  busy,
  jobNow,
  onArchiveFinishedJobs,
  onArchiveJob,
  onPauseJob,
  onResumeJob,
  onContinueSearchInBrowser,
  onOpenSpotifyPanel,
  onOpenPlaylist,
  onReconcileMixed,
  onRecoverPlaylist,
  onSetAutoResume,
  onGoToLibrary,
}: JobsViewProps) {
  return (
    <div className="content-page">
      <div
        className="section-header-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <div>
          <h1>Задания</h1>
          <p className="page-description">
            Прогресс сохраняется на диске. После остановки перенос сверяет уже добавленные записи.
          </p>
        </div>
        {data.jobs.some((j) => j.state === 'complete' || j.state === 'failed') && (
          <button
            className="archive-finished-btn"
            disabled={!!busy}
            onClick={onArchiveFinishedJobs}
            title="Удалить завершённые и ошибочные задания из списка"
          >
            <Archive size={15} />
            Архивировать завершённые (
            {data.jobs.filter((j) => j.state === 'complete' || j.state === 'failed').length})
          </button>
        )}
      </div>
      {data.jobs.length === 0 ? (
        <div className="simple-empty">
          <History size={32} />
          <h2>Заданий пока нет</h2>
          <p>Запусти поиск выбранных записей или проверь план переноса в коллекции.</p>
          <button onClick={onGoToLibrary}>
            К коллекции
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        data.jobs.map((job) => (
          <section className="job" key={job.id}>
            <div className="job-heading">
              <div>
                <h2>
                  {job.kind === 'search'
                    ? 'Поиск кандидатов Spotify'
                    : 'Перенос каталожных записей'}
                </h2>
                <span>
                  {data.collections.find((c) => c.id === job.collectionId)?.name} ·{' '}
                  {new Date(job.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
              <span className={`status-tag ${job.state === 'complete' ? 'spotify' : 'unresolved'}`}>
                {job.retryAt && job.retryAt > jobNow && job.state === 'paused'
                  ? 'Ожидание Spotify'
                  : {
                      running: 'Выполняется',
                      pausing: 'Останавливается',
                      paused: 'Пауза',
                      complete: 'Завершено',
                      failed: 'Ошибка',
                      'needs-review': 'Нужна сверка',
                    }[job.state]}
              </span>
            </div>
            <progress max={job.total || 1} value={job.cursor} aria-label="Прогресс задания" />
            <p aria-live="off">{jobMessage(job, jobNow, data.settings.autoResumeSearch)}</p>
            {job.kind === 'search' && job.backgroundSearch && (
              <label className="search-mode job-search-mode">
                <input
                  type="checkbox"
                  checked={data.settings.autoResumeSearch}
                  disabled={!!busy}
                  onChange={(event) => onSetAutoResume(event.target.checked)}
                />
                Автопродолжение поиска
              </label>
            )}
            {job.state === 'needs-review' && (
              <PlaylistRecovery
                busy={!!busy}
                recover={(playlistId) => onRecoverPlaylist(job.id, playlistId)}
              />
            )}
            <div className="job-actions">
              <span>
                {count(job.cursor)} / {count(job.total)}
              </span>
              {job.state === 'paused' &&
                job.kind === 'search' &&
                job.searchProvider !== 'browser' && (
                  <button disabled={!!busy} onClick={() => onContinueSearchInBrowser(job.id)}>
                    Продолжить через страницу Spotify
                  </button>
                )}
              {job.state === 'paused' && job.searchProvider === 'browser' && (
                <button onClick={() => onOpenSpotifyPanel(job.id)}>Открыть Spotify здесь</button>
              )}
              {job.state === 'paused' && autoSearch(job, data.settings.autoResumeSearch) && (
                <button disabled={!!busy} onClick={() => onPauseJob(job.id)}>
                  Оставить на паузе
                </button>
              )}
              {job.playlistId && (
                <button onClick={() => onOpenPlaylist(job.playlistId!)}>
                  Открыть плейлист
                  <ArrowRight size={15} />
                </button>
              )}
              {job.kind === 'transfer' &&
                job.state === 'complete' &&
                job.plan?.some((item) => item.destination === 'local') && (
                  <button disabled={!!busy} onClick={() => onReconcileMixed(job.id)}>
                    <CheckCheck size={16} />
                    Сверить смешанный порядок
                  </button>
                )}
              {job.state === 'running' ? (
                <button onClick={() => onPauseJob(job.id)}>
                  <Pause size={16} />
                  Пауза
                </button>
              ) : job.state === 'paused' || job.state === 'failed' ? (
                <ExplainedButton
                  hintLabel="Почему продолжение задания недоступно"
                  reason={resumeDisabledReason(
                    job,
                    data.jobs,
                    jobNow,
                    !!busy,
                    job.searchProvider === 'browser' || data.spotify.connected,
                    data.settings.autoResumeSearch,
                  )}
                  onClick={() => onResumeJob(job.id)}
                >
                  <Play size={16} />
                  Продолжить
                </ExplainedButton>
              ) : null}
              {(job.state === 'complete' || job.state === 'failed') && (
                <button
                  className="archive-job-btn"
                  disabled={!!busy}
                  onClick={() => onArchiveJob(job.id)}
                  title="Архивировать это задание"
                >
                  <Archive size={14} />
                  Архивировать
                </button>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

export default JobsView
