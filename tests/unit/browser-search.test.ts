import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ safeStorage: {}, shell: {} }))
import { Store } from '../../src/main/store'
import { Jobs } from '../../src/main/jobs'
import { Spotify } from '../../src/main/spotify'
import { parseImport } from '../../src/core/collection'
import { readSpotifySearch } from '../../src/main/spotify-browser'

describe('search providers and independent API cooldown', () => {
  it('runs a restored browser search while an older API search is waiting for quota', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - First', '.txt', 'Independent queues'))
      const ids = [store.get(id).rows[0].id]
      const apiJob = store.newJob(id, 'search', ids)
      store.putJob({
        ...apiJob,
        backgroundSearch: true,
        autoResume: true,
        retryAt: Date.now() + 86400000,
      })
      const browserJob = store.newJob(id, 'search', ids)
      store.putJob({
        ...browserJob,
        backgroundSearch: true,
        autoResume: true,
        searchProvider: 'browser',
      })
      const search = vi.fn(async () => [])
      const apiSearch = vi.fn(async () => [])
      jobs = new Jobs(
        store,
        { connected: () => true, search: apiSearch } as unknown as Spotify,
        () => {},
        { search, stop: vi.fn() },
      )
      await vi.advanceTimersByTimeAsync(1)
      expect(store.job(browserJob.id).state).toBe('complete')
      expect(store.job(apiJob.id).state).toBe('paused')
      expect(search).toHaveBeenCalledOnce()
      expect(apiSearch).not.toHaveBeenCalled()
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('continues an API search through browser at the saved cursor without clearing the API cooldown', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    const api = { connected: () => false, search: vi.fn() } as unknown as Spotify
    const search = vi.fn(async () => [])
    const jobs = new Jobs(store, api, () => {}, { search, stop: vi.fn() })
    try {
      const id = store.import(parseImport('A - First\nA - Second\nA - Second', '.txt', 'Provider'))
      const original = store.get(id)
      const job = store.newJob(
        id,
        'search',
        original.rows.map((r) => r.id),
      )
      const retryAt = Date.now() + 86400000
      store.putJob({
        ...job,
        cursor: 1,
        retryAt,
        waitReason: 'quota',
        backgroundSearch: true,
        autoResume: false,
      })
      jobs.continueInBrowser(job.id)
      await vi.advanceTimersByTimeAsync(15000)
      expect(store.job(job.id)).toMatchObject({
        cursor: 3,
        searchProvider: 'browser',
        state: 'complete',
      })
      expect(search).toHaveBeenCalledTimes(1)
      expect(search).toHaveBeenCalledWith('A Second')
      expect(api.search).not.toHaveBeenCalled()
      expect(store.value('spotify-api-retryAt', 0)).toBe(retryAt)
      expect(store.get(id).sourceHash).toBe(original.sourceHash)
      expect(store.get(id).rows.map((r) => r.id)).toEqual(original.rows.map((r) => r.id))
      store.setValue('preferences', { ...store.settings(), searchProvider: 'api' })
      const connected = { connected: () => true } as unknown as Spotify
      const more = new Jobs(store, connected, () => {})
      expect(() => more.search(id, [original.rows[0].id])).toThrow('Квота Spotify API')
      more.shutdown()
    } finally {
      jobs.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('keeps an interrupted browser query pending and never retries a page challenge automatically', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    const search = vi.fn(async () => {
      throw new Error('Нужна проверка Spotify')
    })
    const jobs = new Jobs(store, { connected: () => false } as Spotify, () => {}, {
      search,
      stop: vi.fn(),
    })
    try {
      const id = store.import(parseImport('A - First', '.txt', 'Challenge'))
      const jobId = jobs.search(id, [store.get(id).rows[0].id], true)
      await vi.advanceTimersByTimeAsync(86400000)
      expect(store.job(jobId)).toMatchObject({ state: 'paused', cursor: 0, autoResume: false })
      expect(store.get(id).rows[0].working.searchedQuery).toBeNull()
      expect(search).toHaveBeenCalledTimes(1)
    } finally {
      jobs.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('reads a search result whose query contains backslashes or extra spaces', () => {
    const originalLocation = globalThis.location
    const originalDocument = globalThis.document
    try {
      globalThis.location = {
        hostname: 'open.spotify.com',
        pathname:
          '/search/' + encodeURIComponent('kazeWIW #doyalike (speed up reverb)') + '/tracks',
      } as unknown as Location
      globalThis.document = {
        body: {
          innerText:
            'По запросу «kazeWIW #doyalike (speed up reverb)» Треки не найдены. Проверь, нет ли опечаток',
        },
        querySelectorAll: () => [],
      } as unknown as Document

      const result = readSpotifySearch('kazeWIW #doyalike (speed up\\reverb)')
      expect(result.kind).toBe('empty')
    } finally {
      globalThis.location = originalLocation
      globalThis.document = originalDocument
    }
  })
  it('reads a search result whose query contains percent signs like Travis Scott 5% TINT', () => {
    const originalLocation = globalThis.location
    const originalDocument = globalThis.document
    try {
      globalThis.location = {
        hostname: 'open.spotify.com',
        pathname: '/search/' + encodeURIComponent('Travis Scott 5 TINT') + '/tracks',
      } as unknown as Location
      globalThis.document = {
        body: {
          innerText: 'По запросу «Travis Scott 5 TINT» Треки не найдены. Проверь, нет ли опечаток',
        },
        querySelectorAll: () => [],
      } as unknown as Document

      const result = readSpotifySearch('Travis Scott 5% TINT')
      expect(result.kind).toBe('empty')
    } finally {
      globalThis.location = originalLocation
      globalThis.document = originalDocument
    }
  })
})
