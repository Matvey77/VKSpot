import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  Disc3,
  FileAudio,
  SearchX,
  Upload,
} from 'lucide-react'
import type { Collection } from '../../../../shared/model'
import type { ViewState } from '../../../../shared/sync'
import { summarizeCollection, type LibraryFilter } from '../../../../core/library'
import type { SearchResultGroup } from '../../../../core/matching'

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
  onCollections,
  onSelectCollection,
  onReview,
}: {
  data: ViewState
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
  onCollections: () => void
  onSelectCollection: (id: string) => void
  onReview: (decision: LibraryFilter, result: 'all' | SearchResultGroup) => void
}) {
  const rows = collection?.rows ?? []
  const summary = summarizeCollection(collection, data.settings.matchingRules)
  const pending = summary.groups.pending
  const unresolved = summary.unresolved
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
        title = transfer.localCount > 0 ? 'Каталожные треки перенесены' : 'Плейлист создан'
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
  const ready = summary.destinations.spotify + summary.destinations.local
  const included = rows.length - summary.destinations.excluded
  const reviewQueues = [
    {
      name: 'Совпадают данные',
      description: 'Можно подтвердить сразу несколько записей',
      count: summary.groups.exact,
      decision: 'unresolved',
      result: 'exact',
      icon: CheckCheck,
    },
    {
      name: 'Проверить версии',
      description: 'Сравнить найденное с оригиналом',
      count: summary.groups.review,
      decision: 'unresolved',
      result: 'review',
      icon: Disc3,
    },
    {
      name: 'Ничего не найдено',
      description: 'Уточнить запрос или выбрать другой путь',
      count: summary.groups.missing,
      decision: 'unresolved',
      result: 'missing',
      icon: SearchX,
    },
    {
      name: 'Нужен локальный файл',
      description: 'Привязать свою версию с компьютера',
      count: summary.destinations['local-pending'],
      decision: 'local-pending',
      result: 'all',
      icon: FileAudio,
    },
  ] as const
  return (
    <div className="content-page overview-page">
      <header className="overview-heading">
        <div>
          <h1>Обзор</h1>
          <p>Твоя музыка, текущий прогресс и следующий шаг.</p>
        </div>
        <button onClick={onHelp}>
          <BookOpen size={16} />
          Инструкция
        </button>
      </header>
      {collection && (
        <div className="overview-collection-picker">
          <label className="field">
            Текущая коллекция
            <select
              aria-label="Текущая коллекция"
              value={collection.id}
              onChange={(event) => onSelectCollection(event.target.value)}
            >
              {data.collections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={onCollections}>
            Все коллекции
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="overview-grid">
        <section className="overview-next" aria-label="Следующий шаг">
          <h2>{title}</h2>
          <p>{description}</p>
          <div className="button-row">
            <button className="primary next-action" disabled={busy} onClick={next}>
              {action}
              <ArrowRight size={17} />
            </button>
            {!collection && (
              <button disabled={busy} onClick={onImport}>
                <Upload size={16} />
                Импортировать файл
              </button>
            )}
            {collection && next !== onLibrary && (
              <button onClick={onLibrary}>Открыть коллекцию</button>
            )}
          </div>
          <ol className="overview-journey" aria-label="Этапы переноса">
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
          <p className="overview-assurance">
            Оригинал, порядок и повторы сохраняются. Решение о каждой версии остаётся за тобой.
          </p>
        </section>
        {collection ? (
          <section className="overview-review" aria-label="Состояние коллекции">
            <div className="overview-section-heading">
              <h2>Разбор коллекции</h2>
              <span>{rows.length.toLocaleString('ru-RU')} записей</span>
            </div>
            <div className="overview-readiness">
              <div>
                <strong>Готово к переносу</strong>
                <span>
                  {ready.toLocaleString('ru-RU')} из {included.toLocaleString('ru-RU')}
                </span>
              </div>
              <progress
                value={ready}
                max={Math.max(1, included)}
                aria-label="Готовность коллекции к переносу"
              />
              <p>
                Spotify: {summary.destinations.spotify.toLocaleString('ru-RU')} · Локальные файлы:{' '}
                {summary.destinations.local.toLocaleString('ru-RU')} · Исключено:{' '}
                {summary.destinations.excluded.toLocaleString('ru-RU')}
              </p>
            </div>
            <div className="overview-review-list">
              {reviewQueues.map((queue) => (
                <button
                  key={queue.result + queue.decision}
                  onClick={() => onReview(queue.decision, queue.result)}
                  disabled={!queue.count}
                >
                  <queue.icon size={19} />
                  <span>
                    <strong>{queue.name}</strong>
                    <small>{queue.description}</small>
                  </span>
                  <b>{queue.count.toLocaleString('ru-RU')}</b>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <button className="text-button" onClick={onLibrary}>
              Открыть всю коллекцию
              <ArrowRight size={15} />
            </button>
          </section>
        ) : (
          <section className="overview-first-run" aria-label="Как перенести музыку">
            <h2>От списка до своего плейлиста</h2>
            <ol>
              <li>
                <strong>Сохрани список из VK</strong>
                <p>Войди в VK или импортируй готовый JSON, CSV или TXT.</p>
              </li>
              <li>
                <strong>Выбери нужные версии</strong>
                <p>Подтверди совпадения, прослушай спорное, привяжи редкие записи локально.</p>
              </li>
              <li>
                <strong>Проверь и перенеси</strong>
                <p>Создай плейлист Spotify после проверки выбранных назначений.</p>
              </li>
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
