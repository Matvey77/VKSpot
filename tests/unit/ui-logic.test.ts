import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionSummary } from '../../src/core/library'
import { emptyDestinations, emptyGroups } from '../../src/core/library'
import type { JobSummary } from '../../src/shared/sync'
import type { SpotifyBrowserState } from '../../src/shared/types'

vi.mock('../../src/renderer/src/state/api', () => ({ api: {} }))

import { findPausedBrowserJobId } from '../../src/renderer/src/app/browser-job'
import {
  PROXY_VALIDATION_ERROR,
  validateProxyUrl,
} from '../../src/renderer/src/features/connections/useProxyTester'
import { selectNextStep } from '../../src/renderer/src/features/start/next-step'
import {
  clearCollectionDrafts,
  draftsStore,
  type RowDraft,
} from '../../src/renderer/src/state/drafts'

function makeSummary(overrides: Partial<CollectionSummary> = {}): CollectionSummary {
  return {
    groups: { ...emptyGroups(), ...overrides.groups },
    destinations: { ...emptyDestinations(), ...overrides.destinations },
    unresolved: overrides.unresolved ?? 0,
    localPending: overrides.localPending ?? 0,
  }
}

function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    collectionId: 'col-1',
    kind: 'search',
    state: 'paused',
    cursor: 0,
    total: 10,
    message: 'Пауза поиска',
    searchProvider: 'browser',
    localCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('selectNextStep', () => {
  it('returns stage 0 VK import step when no collection exists', () => {
    const step = selectNextStep({
      collection: undefined,
      summary: makeSummary(),
      jobs: [],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
    })

    expect(step).toEqual({
      stage: 0,
      title: 'Твоя музыка из VK — в Spotify',
      description: 'Начни со списка музыки. VKSpot сохранит оригинал и найдёт версии в Spotify.',
      actionLabel: 'Забрать список из VK',
      action: { kind: 'vk' },
    })
  })

  it('recommends starting search when pending tracks exist and provider is ready', () => {
    const step = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 5 }, unresolved: 5 }),
      jobs: [],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
    })

    expect(step.stage).toBe(1)
    expect(step.title).toBe('Найдём версии твоих треков')
    expect(step.action).toEqual({ kind: 'search' })
  })

  it('prompts to connect Spotify when pending tracks exist with disconnected API provider', () => {
    const step = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 3 }, unresolved: 3 }),
      jobs: [],
      settings: { searchProvider: 'api' },
      spotifyConnected: false,
    })

    expect(step.stage).toBe(1)
    expect(step.title).toBe('Подключи Spotify для выбранного способа поиска')
    expect(step.actionLabel).toBe('Открыть подключения')
    expect(step.action).toEqual({ kind: 'connect' })
  })

  it('shows running search progress for running and pausing search jobs', () => {
    for (const state of ['running', 'pausing'] as const) {
      const step = selectNextStep({
        collection: { id: 'col-1' },
        summary: makeSummary({ groups: { ...emptyGroups(), pending: 4 }, unresolved: 4 }),
        jobs: [makeJob({ kind: 'search', state, cursor: 6, total: 10 })],
        settings: { searchProvider: 'api' },
        spotifyConnected: false,
      })

      expect(step.stage).toBe(1)
      expect(step.title).toBe('Поиск уже работает')
      expect(step.description).toContain('6')
      expect(step.description).toContain('10')
      expect(step.action).toEqual({ kind: 'library' })
    }
  })

  it('routes paused or needs-review search jobs to browser attention or resume', () => {
    const verificationAttention: SpotifyBrowserState = {
      state: 'attention',
      reason: 'verification',
      message: 'Verification required',
    }
    const loadAttention: SpotifyBrowserState = {
      state: 'attention',
      reason: 'load',
      message: 'Load failed',
    }

    const verificationStep = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 2 }, unresolved: 2 }),
      jobs: [
        makeJob({ id: 'job-v', state: 'paused', searchProvider: 'browser', message: 'Капча' }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
      spotifyBrowser: verificationAttention,
    })
    expect(verificationStep.title).toBe('Spotify просит подтверждение')
    expect(verificationStep.description).toBe('Капча')
    expect(verificationStep.action).toEqual({ kind: 'browser' })

    const loadStep = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 2 }, unresolved: 2 }),
      jobs: [
        makeJob({
          id: 'job-l',
          state: 'needs-review',
          searchProvider: 'browser',
          message: 'Страница не загрузилась',
        }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
      spotifyBrowser: loadAttention,
    })
    expect(loadStep.title).toBe('Проверим страницу Spotify')
    expect(loadStep.action).toEqual({ kind: 'browser' })

    const browserResume = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 2 }, unresolved: 2 }),
      jobs: [
        makeJob({ id: 'job-b', state: 'paused', searchProvider: 'browser', message: 'Пауза' }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
    })
    expect(browserResume.title).toBe('Продолжим с сохранённого места')
    expect(browserResume.description).toBe('Пауза')
    expect(browserResume.action).toEqual({ kind: 'resume', jobId: 'job-b', useBrowser: false })

    const apiQuotaResume = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), pending: 2 }, unresolved: 2 }),
      jobs: [makeJob({ id: 'job-a', state: 'paused', searchProvider: 'api', message: 'Quota' })],
      settings: { searchProvider: 'api' },
      spotifyConnected: true,
    })
    expect(apiQuotaResume.title).toBe('Продолжим с сохранённого места')
    expect(apiQuotaResume.description).toContain('через страницу Spotify')
    expect(apiQuotaResume.action).toEqual({ kind: 'resume', jobId: 'job-a', useBrowser: true })
  })

  it('returns stage 2 library review when search is complete and versions or local files remain unresolved', () => {
    const versionReview = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({
        groups: { ...emptyGroups(), exact: 2, review: 1 },
        unresolved: 3,
      }),
      jobs: [makeJob({ state: 'complete' })],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
    })
    expect(versionReview.stage).toBe(2)
    expect(versionReview.title).toBe('Проверь найденные версии')
    expect(versionReview.action).toEqual({ kind: 'library' })

    const localFilesPending = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({
        groups: { ...emptyGroups(), 'local-pending': 2, ready: 4 },
        unresolved: 2,
        localPending: 2,
      }),
      jobs: [],
      settings: { searchProvider: 'browser' },
      spotifyConnected: false,
    })
    expect(localFilesPending.stage).toBe(2)
    expect(localFilesPending.title).toBe('Проверь найденные версии')
    expect(localFilesPending.action).toEqual({ kind: 'library' })
  })

  it('handles transfer readiness, active transfer, needs-review transfer and completed transfer', () => {
    const readyToTransfer = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ groups: { ...emptyGroups(), ready: 10 }, unresolved: 0 }),
      jobs: [makeJob({ collectionId: 'other-col', kind: 'transfer', state: 'complete' })],
      settings: { searchProvider: 'browser' },
      spotifyConnected: true,
    })
    expect(readyToTransfer.stage).toBe(2)
    expect(readyToTransfer.title).toBe('Коллекция готова к переносу')
    expect(readyToTransfer.action).toEqual({ kind: 'transfer' })

    const runningTransfer = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ unresolved: 0 }),
      jobs: [
        makeJob({
          kind: 'transfer',
          state: 'running',
          message: 'Добавлено 5 из 10',
        }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: true,
    })
    expect(runningTransfer.stage).toBe(2)
    expect(runningTransfer.title).toBe('Перенос уже работает')
    expect(runningTransfer.description).toBe('Добавлено 5 из 10')
    expect(runningTransfer.action).toEqual({ kind: 'jobs' })

    const needsReviewTransfer = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ unresolved: 0 }),
      jobs: [
        makeJob({
          kind: 'transfer',
          state: 'needs-review',
          message: 'Проверьте смешанные треки',
        }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: true,
    })
    expect(needsReviewTransfer.stage).toBe(2)
    expect(needsReviewTransfer.title).toBe('Продолжим перенос')
    expect(needsReviewTransfer.description).toBe('Проверьте смешанные треки')
    expect(needsReviewTransfer.action).toEqual({ kind: 'jobs' })

    const completePlaylist = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ unresolved: 0 }),
      jobs: [
        makeJob({
          kind: 'transfer',
          state: 'complete',
          localCount: 0,
          message: 'Создан плейлист',
        }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: true,
    })
    expect(completePlaylist.title).toBe('Плейлист создан')
    expect(completePlaylist.action).toEqual({ kind: 'jobs' })

    const completeWithLocal = selectNextStep({
      collection: { id: 'col-1' },
      summary: makeSummary({ unresolved: 0 }),
      jobs: [
        makeJob({
          kind: 'transfer',
          state: 'complete',
          localCount: 2,
          message: 'Плейлист + локальные файлы',
        }),
      ],
      settings: { searchProvider: 'browser' },
      spotifyConnected: true,
    })
    expect(completeWithLocal.title).toBe('Каталожные треки перенесены')
    expect(completeWithLocal.action).toEqual({ kind: 'jobs' })
  })
})

describe('validateProxyUrl', () => {
  it('accepts empty values and valid HTTP/HTTPS/SOCKS5 proxy URLs', () => {
    expect(validateProxyUrl('')).toBeNull()
    expect(validateProxyUrl('   ')).toBeNull()
    expect(validateProxyUrl('http://127.0.0.1:2080')).toBeNull()
    expect(validateProxyUrl('https://proxy.example.com:8443/')).toBeNull()
    expect(validateProxyUrl('socks5://127.0.0.1:1080')).toBeNull()
    expect(validateProxyUrl('socks5h://localhost:1080')).toBeNull()
    expect(validateProxyUrl('  HTTP://[::1]:8080  ')).toBeNull()
  })

  it('rejects credentials, paths, query strings, hashes, disallowed schemes and malformed URLs', () => {
    const invalidCases = [
      'http://user:pass@127.0.0.1:2080',
      'http://user@127.0.0.1:2080',
      'http://:secret@127.0.0.1:2080',
      'http://127.0.0.1:2080/path',
      'http://127.0.0.1:2080?query=1',
      'http://127.0.0.1:2080#hash',
      'file:///etc/passwd',
      'ftp://127.0.0.1:21',
      'socks4://127.0.0.1:1080',
      '127.0.0.1:2080',
      'not a valid url',
      'http://',
      'http://127.0.0.1/' + 'a'.repeat(1000),
    ]

    for (const value of invalidCases) {
      expect(validateProxyUrl(value), value).toBe(PROXY_VALIDATION_ERROR)
    }
  })
})

describe('draftsStore', () => {
  const sampleDraft: RowDraft = {
    artist: 'Artist',
    title: 'Edited Title',
    version: 'Remix',
    note: 'Check live take',
  }

  beforeEach(() => {
    draftsStore.clearAll()
  })

  it('stores, reads, updates and clears individual or collection drafts', () => {
    expect(draftsStore.get('row-1')).toBeUndefined()

    draftsStore.set('row-1', sampleDraft)
    draftsStore.set('row-2', { ...sampleDraft, title: 'Second' })
    draftsStore.set('row-3', { ...sampleDraft, title: 'Other Collection' })

    expect(draftsStore.get('row-1')).toEqual(sampleDraft)

    draftsStore.set('row-1', undefined)
    expect(draftsStore.get('row-1')).toBeUndefined()

    clearCollectionDrafts(['row-2', 'missing-row'])
    expect(draftsStore.get('row-2')).toBeUndefined()
    expect(draftsStore.get('row-3')?.title).toBe('Other Collection')

    draftsStore.clearRow('row-3')
    expect(draftsStore.get('row-3')).toBeUndefined()
  })

  it('notifies only matching row subscribers and stops after unsubscribe', () => {
    const row1Listener = vi.fn()
    const row2Listener = vi.fn()

    const unsubscribe1 = draftsStore.subscribe('row-1', row1Listener)
    const unsubscribe2 = draftsStore.subscribe('row-2', row2Listener)

    draftsStore.set('row-1', sampleDraft)
    expect(row1Listener).toHaveBeenCalledTimes(1)
    expect(row2Listener).not.toHaveBeenCalled()

    // Clearing an empty row or setting undefined on missing row is a no-op
    draftsStore.clearRow('row-2')
    draftsStore.set('row-2', undefined)
    expect(row2Listener).not.toHaveBeenCalled()

    draftsStore.set('row-2', sampleDraft)
    expect(row2Listener).toHaveBeenCalledTimes(1)

    unsubscribe1()
    draftsStore.clearRow('row-1')
    expect(row1Listener).toHaveBeenCalledTimes(1)

    draftsStore.clearAll()
    expect(row2Listener).toHaveBeenCalledTimes(2)
    unsubscribe2()
  })
})

describe('findPausedBrowserJobId', () => {
  it('returns undefined when no paused browser search job matches', () => {
    expect(findPausedBrowserJobId(undefined)).toBeUndefined()
    expect(findPausedBrowserJobId([])).toBeUndefined()
    expect(
      findPausedBrowserJobId([
        makeJob({ id: 'api-paused', searchProvider: 'api', state: 'paused' }),
        makeJob({ id: 'browser-running', searchProvider: 'browser', state: 'running' }),
        makeJob({ id: 'browser-complete', searchProvider: 'browser', state: 'complete' }),
        makeJob({ id: 'browser-review', searchProvider: 'browser', state: 'needs-review' }),
        makeJob({ id: 'transfer-paused', kind: 'transfer', state: 'paused' }),
      ]),
    ).toBeUndefined()
  })

  it('returns the most recently updated paused browser search job ID', () => {
    const jobs: JobSummary[] = [
      makeJob({
        id: 'older-paused',
        searchProvider: 'browser',
        state: 'paused',
        updatedAt: '2026-01-01T10:00:00.000Z',
      }),
      makeJob({
        id: 'api-newer',
        searchProvider: 'api',
        state: 'paused',
        updatedAt: '2026-01-01T15:00:00.000Z',
      }),
      makeJob({
        id: 'browser-running-newer',
        searchProvider: 'browser',
        state: 'running',
        updatedAt: '2026-01-01T16:00:00.000Z',
      }),
      makeJob({
        id: 'newest-paused',
        searchProvider: 'browser',
        state: 'paused',
        updatedAt: '2026-01-01T12:30:00.000Z',
      }),
      makeJob({
        id: 'middle-paused',
        searchProvider: 'browser',
        state: 'paused',
        updatedAt: '2026-01-01T11:00:00.000Z',
      }),
    ]

    expect(findPausedBrowserJobId(jobs)).toBe('newest-paused')
  })
})
