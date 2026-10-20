import type { JobSummary, ViewState } from '../../../../shared/sync'
import { jobMessage } from '../../../../shared/job-status'
import { SpotifyIcon, VKIcon } from '../brand/BrandIcons'
import ExplainedButton from '../ui/ExplainedButton'
import useRetryClock from '../../hooks/useRetryClock'

const count = (value: number) => value.toLocaleString('ru-RU')
export default function SidebarStatus({
  data,
  onSpotify,
  onVK,
  onJobs,
}: {
  data: ViewState | null
  onSpotify: () => void
  onVK: () => void
  onJobs: () => void
}) {
  const latest = data?.jobs.reduce<JobSummary | undefined>(
    (current, job) =>
      !current || Date.parse(job.createdAt) > Date.parse(current.createdAt) ? job : current,
    undefined,
  )
  const now = useRetryClock(latest?.retryAt ?? 0)
  const browser = data?.settings.searchProvider === 'browser'
  const attention = data?.spotifyBrowser?.state === 'attention'
  const spotify = !data
    ? 'Проверяем'
    : attention
      ? data?.spotifyBrowser?.reason === 'verification'
        ? 'Нужна помощь'
        : 'Ошибка'
      : data?.spotify.connected
        ? data.spotify.name || 'Подключён'
        : browser
          ? 'Через сайт'
          : 'Не подключён'
  const spotifyHint = attention
    ? data?.spotifyBrowser?.message
    : data?.spotify.connected
      ? `Spotify подключён: ${data.spotify.name || 'профиль подтверждён'}. Нажми, чтобы открыть подключение.`
      : browser
        ? 'Поиск идёт через сайт Spotify; вход для него не обязателен. Подключение для переноса пока не подтверждено.'
        : 'Spotify не подключён. Нажми, чтобы настроить подключение.'
  const vk = data?.vk?.state ?? 'unknown'
  const vkLabels = {
    unknown: 'Не проверен',
    checking: 'Проверяем',
    connected: 'Подключён',
    'sign-in': 'Нужен вход',
    error: 'Нет связи',
  }
  const vkHint = [
    data?.vk?.message ||
      (vk === 'unknown'
        ? 'Открой VK, чтобы проверить вход. Наличие сохранённого списка не подтверждает подключение.'
        : 'Нажми, чтобы открыть VK.'),
    data?.vk?.checkedAt
      ? `Последняя проверка: ${new Date(data.vk.checkedAt).toLocaleString('ru-RU')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  const state =
    latest &&
    {
      running: 'В работе',
      pausing: 'Остановка',
      paused: latest.retryAt && latest.retryAt > now ? 'Ожидание' : 'Пауза',
      complete: 'Готово',
      failed: 'Ошибка',
      'needs-review': 'Проверить',
    }[latest.state]
  const percent =
    latest && latest.total > 0
      ? Math.min(100, Math.max(0, Math.round((latest.cursor / latest.total) * 100)))
      : 0
  const collection = data?.collections.find((item) => item.id === latest?.collectionId)?.name
  return (
    <section className="sidebar-status" aria-label="Подключения и последнее задание">
      <div className="sidebar-connections">
        <ExplainedButton
          className="sidebar-service"
          hintLabel="Статус Spotify"
          hint={spotifyHint}
          onClick={onSpotify}
          aria-label={`Spotify: ${spotify}`}
        >
          <span className="sidebar-service-name">
            <SpotifyIcon size={15} />
            Spotify
            <span
              className={`connection-light ${attention ? 'attention' : data?.spotify.connected ? 'connected' : ''}`}
            />
          </span>
          <span
            className={`sidebar-service-value ${data?.spotify.connected ? 'connected' : attention ? 'attention' : ''}`}
          >
            {spotify}
          </span>
        </ExplainedButton>
        <ExplainedButton
          className="sidebar-service"
          hintLabel="Статус VK"
          hint={vkHint}
          onClick={onVK}
          aria-label={`VK: ${vkLabels[vk]}`}
        >
          <span className="sidebar-service-name">
            <VKIcon size={15} />
            VK
            <span
              className={`connection-light ${vk === 'connected' ? 'connected' : vk === 'sign-in' || vk === 'error' ? 'attention' : ''}`}
            />
          </span>
          <span
            className={`sidebar-service-value ${vk === 'connected' ? 'connected' : vk === 'sign-in' || vk === 'error' ? 'attention' : ''}`}
          >
            {vkLabels[vk]}
          </span>
        </ExplainedButton>
      </div>
      <ExplainedButton
        className="sidebar-job"
        hintLabel="Последнее задание"
        onClick={onJobs}
        hint={
          latest
            ? `${latest.kind === 'search' ? 'Поиск Spotify' : 'Перенос'} · ${collection ?? 'Коллекция'}. ${jobMessage(latest, now, data?.settings.autoResumeSearch)} Нажми, чтобы открыть задания.`
            : 'Здесь появятся состояние и прогресс последнего созданного задания.'
        }
        aria-label={
          latest
            ? `Последнее задание: ${latest.kind === 'search' ? 'Поиск Spotify' : 'Перенос'}, ${state}, ${count(latest.cursor)} из ${count(latest.total)}`
            : 'Последнее задание: заданий пока нет'
        }
      >
        {latest ? (
          <>
            <span className="sidebar-job-heading">
              <span>{latest.kind === 'search' ? 'Поиск Spotify' : 'Перенос'}</span>
              <span>{state}</span>
            </span>
            <span className="sidebar-job-count">
              <span>
                {count(latest.cursor)} / {count(latest.total)}
              </span>
              <span>{percent}%</span>
            </span>
            <progress
              value={latest.cursor}
              max={Math.max(1, latest.total)}
              aria-label="Прогресс последнего задания"
            />
          </>
        ) : (
          <span className="sidebar-job-empty">Заданий пока нет</span>
        )}
      </ExplainedButton>
    </section>
  )
}
