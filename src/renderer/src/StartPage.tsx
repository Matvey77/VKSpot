import { ArrowRight, Check, Upload } from 'lucide-react'
import type { AppState, Collection } from '../../shared/model'
import { reviewGroup } from '../../core/matching'

export default function StartPage({
  data,
  collection,
  busy,
  onImport,
  onVK,
  onLibrary,
  onSearch,
  onBrowser,
  onResume,
  onTransfer,
  onHelp,
  onJobs,
  onConnect,
}: {
  data: AppState
  collection?: Collection
  busy: boolean
  onImport: () => void
  onVK: () => void
  onLibrary: () => void
  onSearch: () => void
  onBrowser: () => void
  onResume: (id: string, browser: boolean) => void
  onTransfer: () => void
  onHelp: () => void
  onJobs: () => void
  onConnect: () => void
}) {
  const rows = collection?.rows ?? []
  const pending = rows.filter((row) => reviewGroup(row) === 'pending').length
  const unresolved = rows.filter(
    (row) => !row.working.excluded && row.working.destination === 'unresolved',
  ).length
  const job = data.jobs.find(
    (item) =>
      item.collectionId === collection?.id && item.kind === 'search' && item.state !== 'complete',
  )
  const transfer = data.jobs.find(
    (item) => item.collectionId === collection?.id && item.kind === 'transfer',
  )
  let title = 'Твоя музыка из VK — в Spotify'
  let description = 'Начни со списка музыки. VKSpot сохранит оригинал и найдёт версии в Spotify.'
  let action = 'Забрать список из VK',
    next = onVK,
    stage = 0
  if (collection) {
    stage = 1
    title = 'Найдём версии твоих треков'
    description = 'Поиск работает в фоне. Результаты будут появляться в таблице.'
    action = 'Начать поиск'
    next = onSearch
    if (job?.state === 'running' || job?.state === 'pausing') {
      title = 'Поиск уже работает'
      description = `Обработано ${job.cursor.toLocaleString('ru-RU')} из ${job.total.toLocaleString('ru-RU')}. Можно разбирать найденное.`
      action = 'Открыть результаты'
      next = onLibrary
    } else if (job) {
      const needsPage =
        data.spotifyBrowser?.state === 'attention' && job.searchProvider === 'browser'
      title = needsPage
        ? data.spotifyBrowser?.reason === 'verification'
          ? 'Spotify просит подтверждение'
          : 'Проверим страницу Spotify'
        : 'Продолжим с сохранённого места'
      description =
        job.searchProvider === 'browser'
          ? job.message
          : 'Можно продолжить через страницу Spotify, пока API ожидает восстановления квоты.'
      action = needsPage ? 'Открыть Spotify здесь' : 'Продолжить поиск'
      next = needsPage ? onBrowser : () => onResume(job.id, job.searchProvider !== 'browser')
    } else if (!pending && unresolved) {
      stage = 2
      title = 'Проверь найденные версии'
      description = 'Совпадения можно подтвердить группой. Спорные записи открой для сравнения.'
      action = 'Проверить результаты'
      next = onLibrary
    } else if (!unresolved) {
      stage = 2
      title = 'Коллекция готова к переносу'
      description = 'Проверь состав перед созданием плейлиста.'
      action = 'Проверить перенос'
      next = onTransfer
      if (transfer?.state === 'complete') {
        title = transfer.plan?.some((item) => item.destination === 'local')
          ? 'Каталожные треки перенесены'
          : 'Плейлист создан'
        description = transfer.message
        action = 'Открыть задание'
        next = onJobs
      } else if (transfer) {
        title = transfer.state === 'running' ? 'Перенос уже работает' : 'Продолжим перенос'
        description = transfer.message
        action = 'Открыть задание'
        next = onJobs
      }
    }
    if (pending && !job && data.settings.searchProvider === 'api' && !data.spotify.connected) {
      title = 'Подключи Spotify для выбранного способа поиска'
      description =
        'В параметрах выбран Spotify API. Подключи его или выбери поиск через страницу без Client ID.'
      action = 'Открыть подключения'
      next = onConnect
    }
  }
  return (
    <div className="content-page start-page">
      <ol className="journey" aria-label="Этапы переноса">
        {['Список из VK', 'Поиск версий', 'Проверка и перенос'].map((name, index) => (
          <li
            key={name}
            aria-current={stage === index ? 'step' : undefined}
            className={index < stage ? 'done' : ''}
          >
            <span>{index < stage ? <Check size={14} /> : index + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <section className="start-next" aria-label="Следующий шаг">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="button-row">
          <button className="primary next-action" disabled={busy} onClick={next}>
            {action}
            <ArrowRight size={17} />
          </button>
          {!collection && (
            <button disabled={busy} onClick={onImport}>
              <Upload size={16} />У меня уже есть список
            </button>
          )}
        </div>
      </section>
      {collection && (
        <button className="start-collection" onClick={onLibrary}>
          <span>
            <strong>{collection.name}</strong>
            <small>
              {rows.length.toLocaleString('ru-RU')} записей · решено{' '}
              {(rows.length - unresolved).toLocaleString('ru-RU')}
            </small>
          </span>
          <ArrowRight size={20} />
        </button>
      )}
      <button className="text-button" onClick={onHelp}>
        Нужна помощь? Открыть инструкцию
        <ArrowRight size={15} />
      </button>
    </div>
  )
}
