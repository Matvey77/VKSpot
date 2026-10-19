import { Pause, Play, Search } from 'lucide-react'
import type { Job } from '../../shared/model'
import {
  autoSearch,
  jobMessage,
  resumeDisabledReason,
  retryDeadline,
  waitingJob,
} from '../../shared/job-status'
import ExplainedButton from './ExplainedButton'
import useRetryClock from './useRetryClock'

const count = (n: number) => n.toLocaleString('ru-RU')
export default function SearchControls({
  collectionId,
  jobs,
  busy,
  connected,
  pending,
  resolved,
  total,
  autoResume,
  onAutoResume: _onAutoResume,
  onStart,
  onControl,
  compact = false,
  provider = 'api',
  onProvider: _onProvider,
  onOpenBrowser,
  onBrowserResume,
}: {
  collectionId: string
  jobs: Job[]
  busy: boolean
  connected: boolean
  pending: number
  resolved: number
  total: number
  autoResume: boolean
  onAutoResume: (value: boolean) => void
  onStart: () => void
  onControl: (id: string, action: 'pause' | 'resume') => void
  compact?: boolean
  provider?: 'browser' | 'api'
  onProvider?: (value: 'browser' | 'api') => void
  onOpenBrowser?: () => void
  onBrowserResume?: (id: string) => void
}) {
  const now = useRetryClock(retryDeadline(jobs))
  const searches = jobs.filter(
    (item) => item.collectionId === collectionId && item.kind === 'search',
  )
  const job =
    searches.find((item) => item.state === 'running' || item.state === 'pausing') ??
    searches.find((item) => item.backgroundSearch && item.state !== 'complete') ??
    searches[0]
  const active = jobs.find((item) => item.state === 'running' || item.state === 'pausing')
  const browser =
    (job?.state !== 'complete' && job?.searchProvider ? job.searchProvider : provider) === 'browser'
  const waiting = browser ? undefined : waitingJob(jobs, now)
  const reason = busy
    ? 'Дождись завершения текущего действия.'
    : waiting
      ? jobMessage(waiting, now, autoResume)
      : !connected
        ? 'Подключи Spotify в разделе «Подключения». Уже найденные версии можно разбирать без подключения.'
        : active
          ? active.id === job?.id
            ? 'Поиск уже работает. Прогресс и кнопка паузы находятся здесь же.'
            : 'Другое задание ещё работает. Дождись завершения или приостанови его в разделе «Задания».'
          : job && job.state !== 'complete'
            ? 'У коллекции уже есть незавершённый поиск. Продолжи его: найденные результаты не нужно искать заново.'
            : !pending
              ? 'Нет записей для нового фонового поиска. Записи уже найдены, разобраны или отложены.'
              : undefined
  const title = !job
    ? ''
    : job.state === 'complete'
      ? 'Поиск завершён'
      : job.retryAt && job.retryAt > now
        ? 'Поиск ожидает Spotify'
        : job.state === 'running' || job.state === 'pausing'
          ? 'Поиск идёт в фоне'
          : 'Поиск приостановлен'
  return (
    <section
      className={`collection-search ${compact ? 'compact' : ''}`}
      aria-label="Фоновый поиск Spotify"
    >
      <div className="review-heading">
        {!compact && (
          <div>
            <h2>Найти совпадения, проверить спорное</h2>
            <p>
              Решено {count(resolved)} из {count(total)}. Названия, исходный порядок и повторы
              сохраняются.
            </p>
          </div>
        )}
        {(!job || job.state === 'complete') && pending > 0 && (
          <ExplainedButton
            className="primary"
            reason={reason}
            hintLabel="Почему фоновый поиск недоступен"
            hint={
              browser
                ? 'VKSpot сам открывает запросы на странице Spotify и сохраняет результаты. Версии выбираешь ты.'
                : 'Поиск кандидатов через Spotify API. При ограничении очередь сохранится.'
            }
            onClick={onStart}
          >
            <Search size={16} /> Фоновый поиск ({count(pending)})
          </ExplainedButton>
        )}
      </div>
      {!compact && !connected && (
        <p className="review-help">
          Для новых запросов подключи Spotify. Уже найденные версии можно разобрать сейчас.
        </p>
      )}
      {job && (
        <div className="review-progress" role="status" aria-live="polite">
          <div>
            <strong>
              {title} · {count(job.cursor)} / {count(job.total)}
            </strong>
            {(!compact ||
              (job.state !== 'running' && job.state !== 'complete' && job.state !== 'pausing')) && (
              <p aria-live="off">{jobMessage(job, now, autoResume)}</p>
            )}
            {job.state !== 'complete' && (
              <progress
                value={job.cursor}
                max={Math.max(1, job.total)}
                aria-label="Прогресс фонового поиска"
              />
            )}
          </div>
          {job.state !== 'complete' && (
            <div className="button-row search-job-actions">
              {job.state === 'paused' && browser && (
                <button onClick={onOpenBrowser}>Открыть Spotify здесь</button>
              )}
              {job.state === 'paused' && !browser && onBrowserResume && (
                <ExplainedButton
                  hintLabel="Поиск без ожидания квоты API"
                  hint="Продолжим с той же записи через обычную страницу Spotify. Уже найденные варианты сохранятся."
                  reason={busy || !!active ? 'Дождись остановки текущего действия.' : undefined}
                  onClick={() => onBrowserResume(job.id)}
                >
                  Продолжить через страницу Spotify
                </ExplainedButton>
              )}
              {job.state === 'paused' && autoSearch(job, autoResume) && (
                <button disabled={busy} onClick={() => onControl(job.id, 'pause')}>
                  Оставить на паузе
                </button>
              )}
              <ExplainedButton
                className={job.state === 'paused' && browser ? 'primary' : undefined}
                hintLabel="Почему управление поиском недоступно"
                reason={
                  job.state === 'pausing'
                    ? 'Текущий запрос завершается. Его результат будет сохранён; затем можно продолжить.'
                    : job.state === 'running'
                      ? busy
                        ? 'Дождись завершения текущего действия.'
                        : undefined
                      : resumeDisabledReason(job, jobs, now, busy, connected, autoResume)
                }
                onClick={() => onControl(job.id, job.state === 'running' ? 'pause' : 'resume')}
              >
                {job.state === 'running' ? <Pause size={15} /> : <Play size={15} />}
                {job.state === 'pausing'
                  ? 'Останавливаем поиск…'
                  : job.state === 'running'
                    ? 'Пауза поиска'
                    : 'Продолжить поиск'}
              </ExplainedButton>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
