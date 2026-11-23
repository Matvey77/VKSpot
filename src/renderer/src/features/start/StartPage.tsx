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
import type { Collection } from '../../../../shared/types'
import type { ViewState } from '../../../../shared/sync'
import { summarizeCollection, type LibraryFilter } from '../../../../core/library'
import type { SearchResultGroup } from '../../../../core/matching'
import { selectNextStep } from './next-step'

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
  const nextStep = selectNextStep({
    collection,
    summary,
    jobs: data.jobs,
    settings: data.settings,
    spotifyConnected: data.spotify.connected,
    spotifyBrowser: data.spotifyBrowser,
  })
  const executeNextStep = () => {
    switch (nextStep.action.kind) {
      case 'vk':
        onVK()
        break
      case 'search':
        onSearch()
        break
      case 'library':
        onLibrary()
        break
      case 'browser':
        onBrowser()
        break
      case 'resume':
        onResume(nextStep.action.jobId, nextStep.action.useBrowser)
        break
      case 'transfer':
        onTransfer()
        break
      case 'jobs':
        onJobs()
        break
      case 'connect':
        onConnect()
        break
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
          <BookOpen size={16} aria-hidden="true" />
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
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="overview-grid">
        <section className="overview-next" aria-label="Следующий шаг">
          <h2>{nextStep.title}</h2>
          <p>{nextStep.description}</p>
          <div className="button-row">
            <button className="primary next-action" disabled={busy} onClick={executeNextStep}>
              {nextStep.actionLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            {!collection && (
              <button disabled={busy} onClick={onImport}>
                <Upload size={16} aria-hidden="true" />
                Импортировать файл
              </button>
            )}
            {collection && nextStep.action.kind !== 'library' && (
              <button onClick={onLibrary}>Открыть коллекцию</button>
            )}
          </div>
          <ol className="overview-journey" aria-label="Этапы переноса">
            {['Список из VK', 'Поиск версий', 'Проверка и перенос'].map((name, index) => (
              <li
                key={name}
                aria-current={nextStep.stage === index ? 'step' : undefined}
                className={index < nextStep.stage ? 'done' : ''}
              >
                <span>
                  {index < nextStep.stage ? <Check size={14} aria-hidden="true" /> : index + 1}
                </span>
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
                  <queue.icon size={19} aria-hidden="true" />
                  <span>
                    <strong>{queue.name}</strong>
                    <small>{queue.description}</small>
                  </span>
                  <b>{queue.count.toLocaleString('ru-RU')}</b>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="text-button" onClick={onLibrary}>
              Открыть всю коллекцию
              <ArrowRight size={15} aria-hidden="true" />
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
