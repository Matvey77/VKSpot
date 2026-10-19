import type { Job } from './model'

export function waitingJob(jobs: Job[], now: number): Job | undefined {
  return jobs.reduce<Job | undefined>(
    (latest, job) =>
      job.searchProvider !== 'browser' &&
      (job.state === 'paused' || job.state === 'failed') &&
      Number.isFinite(job.retryAt) &&
      job.retryAt! > now &&
      (!latest || job.retryAt! > latest.retryAt!)
        ? job
        : latest,
    undefined,
  )
}

export function retryDeadline(jobs: Job[]): number {
  return jobs.reduce(
    (latest, job) =>
      (job.state === 'paused' || job.state === 'failed') && Number.isFinite(job.retryAt)
        ? Math.max(latest, job.retryAt!)
        : latest,
    0,
  )
}

export function waitDuration(milliseconds: number): string {
  if (milliseconds < 60000) return `${Math.max(1, Math.ceil(milliseconds / 1000))} с`
  const minutes = Math.ceil(milliseconds / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  return [days && `${days} д`, hours && `${hours} ч`, rest && `${rest} мин`]
    .filter(Boolean)
    .join(' ')
}

export function retryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function autoSearch(job: Job, enabled: boolean): boolean {
  return (
    enabled &&
    job.kind === 'search' &&
    job.backgroundSearch === true &&
    job.autoResume !== false &&
    (Number.isFinite(job.retryAt) || job.autoResume === true)
  )
}

export function jobMessage(job: Job, now: number, autoResumeSearch = false): string {
  if (job.state === 'paused' && !Number.isFinite(job.retryAt) && autoSearch(job, autoResumeSearch))
    return 'Прогресс сохранён. Фоновый поиск продолжится автоматически при подключённом Spotify, когда освободится очередь.'
  if (!Number.isFinite(job.retryAt) || (job.state !== 'paused' && job.state !== 'failed'))
    return job.message
  // Older jobs carry only the saved message and deadline; no migration is needed.
  const quota = job.waitReason === 'quota' || (!job.waitReason && /квота/i.test(job.message))
  if (job.retryAt! <= now && autoSearch(job, autoResumeSearch))
    return 'Срок ожидания Spotify истёк. Фоновый поиск продолжится автоматически при подключённом Spotify. Прогресс сохранён; сервис может снова ограничить запросы.'
  if (job.retryAt! <= now)
    return 'Срок ожидания Spotify истёк. Нажми «Продолжить», чтобы повторить запрос с сохранённой позиции. Spotify может снова ограничить запросы.'
  return `${quota ? 'Исчерпана квота запросов Spotify.' : 'Spotify ограничил частоту запросов.'} Прогресс и результаты сохранены. Повтор не раньше ${retryTime(job.retryAt!)} (время компьютера). Осталось ${waitDuration(job.retryAt! - now)}. ${autoSearch(job, autoResumeSearch) ? 'Поиск продолжится автоматически при подключённом Spotify.' : 'После ожидания нажми «Продолжить».'} Уже найденные версии можно разбирать сейчас.`
}

export function resumeDisabledReason(
  job: Job,
  jobs: Job[],
  now: number,
  busy: boolean,
  connected: boolean,
  autoResumeSearch = false,
): string | undefined {
  if (busy) return 'Дождись завершения текущего действия.'
  if (job.retryAt && job.retryAt > now) return jobMessage(job, now, autoResumeSearch)
  const waiting = job.searchProvider === 'browser' ? undefined : waitingJob(jobs, now)
  if (waiting) return jobMessage(waiting, now, autoResumeSearch)
  if (!connected && job.searchProvider !== 'browser')
    return 'Подключи Spotify в разделе «Подключения», чтобы продолжить задание.'
  if (jobs.some((item) => item.state === 'running' || item.state === 'pausing'))
    return 'Другое задание ещё работает. Дождись завершения или приостанови его в разделе «Задания».'
  if (job.state === 'needs-review') return 'Сначала сверь созданный плейлист в разделе «Задания».'
  return undefined
}
