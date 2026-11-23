import type { CollectionSummary } from '../../../../core/library'
import { formatCount } from '../../../../shared/ru'
import type { JobSummary } from '../../../../shared/sync'
import type { Collection, Settings, SpotifyBrowserState } from '../../../../shared/types'

export type NextStepAction =
  | { kind: 'vk' }
  | { kind: 'search' }
  | { kind: 'library' }
  | { kind: 'browser' }
  | { kind: 'resume'; jobId: string; useBrowser: boolean }
  | { kind: 'transfer' }
  | { kind: 'jobs' }
  | { kind: 'connect' }

export interface NextStep {
  stage: 0 | 1 | 2
  title: string
  description: string
  actionLabel: string
  action: NextStepAction
}

export interface SelectNextStepInput {
  collection?: Pick<Collection, 'id'>
  summary: CollectionSummary
  jobs: readonly JobSummary[]
  settings: Pick<Settings, 'searchProvider'>
  spotifyConnected: boolean
  spotifyBrowser?: SpotifyBrowserState
}

/** Computes the primary StartPage recommendation from pure domain and job state. */
export function selectNextStep({
  collection,
  summary,
  jobs,
  settings,
  spotifyConnected,
  spotifyBrowser,
}: SelectNextStepInput): NextStep {
  if (!collection) {
    return {
      stage: 0,
      title: 'Твоя музыка из VK — в Spotify',
      description: 'Начни со списка музыки. VKSpot сохранит оригинал и найдёт версии в Spotify.',
      actionLabel: 'Забрать список из VK',
      action: { kind: 'vk' },
    }
  }

  const pending = summary.groups.pending
  const unresolved = summary.unresolved
  const job = jobs.find(
    (item) =>
      item.collectionId === collection.id && item.kind === 'search' && item.state !== 'complete',
  )
  const transfer = jobs.find(
    (item) => item.collectionId === collection.id && item.kind === 'transfer',
  )

  let stage: 1 | 2 = 1
  let title = 'Найдём версии твоих треков'
  let description = 'Поиск работает в фоне. Результаты будут появляться в таблице.'
  let actionLabel = 'Начать поиск'
  let action: NextStepAction = { kind: 'search' }

  if (job?.state === 'running' || job?.state === 'pausing') {
    title = 'Поиск уже работает'
    description = `Обработано ${formatCount(job.cursor)} из ${formatCount(job.total)}. Можно разбирать найденное.`
    actionLabel = 'Открыть результаты'
    action = { kind: 'library' }
  } else if (job) {
    const needsPage = spotifyBrowser?.state === 'attention' && job.searchProvider === 'browser'
    title = needsPage
      ? spotifyBrowser?.reason === 'verification'
        ? 'Spotify просит подтверждение'
        : 'Проверим страницу Spotify'
      : 'Продолжим с сохранённого места'
    description =
      job.searchProvider === 'browser'
        ? job.message
        : 'Можно продолжить через страницу Spotify, пока API ожидает восстановления квоты.'
    actionLabel = needsPage ? 'Открыть Spotify здесь' : 'Продолжить поиск'
    action = needsPage
      ? { kind: 'browser' }
      : { kind: 'resume', jobId: job.id, useBrowser: job.searchProvider !== 'browser' }
  } else if (!pending && unresolved) {
    stage = 2
    title = 'Проверь найденные версии'
    description = 'Совпадения можно подтвердить группой. Спорные записи открой для сравнения.'
    actionLabel = 'Проверить результаты'
    action = { kind: 'library' }
  } else if (!unresolved) {
    stage = 2
    if (transfer?.state === 'complete') {
      title = transfer.localCount > 0 ? 'Каталожные треки перенесены' : 'Плейлист создан'
      description = transfer.message
      actionLabel = 'Открыть задание'
      action = { kind: 'jobs' }
    } else if (transfer) {
      title = transfer.state === 'running' ? 'Перенос уже работает' : 'Продолжим перенос'
      description = transfer.message
      actionLabel = 'Открыть задание'
      action = { kind: 'jobs' }
    } else {
      title = 'Коллекция готова к переносу'
      description = 'Проверь состав перед созданием плейлиста.'
      actionLabel = 'Проверить перенос'
      action = { kind: 'transfer' }
    }
  }

  if (pending && !job && settings.searchProvider === 'api' && !spotifyConnected) {
    title = 'Подключи Spotify для выбранного способа поиска'
    description =
      'В параметрах выбран Spotify API. Подключи его или выбери поиск через страницу без Client ID.'
    actionLabel = 'Открыть подключения'
    action = { kind: 'connect' }
  }

  return { stage, title, description, actionLabel, action }
}
