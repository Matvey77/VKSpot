import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ safeStorage: {}, shell: {} }))
import { Store } from '../../src/main/storage'
import { Jobs } from '../../src/main/jobs/runner'
import { Spotify } from '../../src/main/integrations/spotify/api'
import { parseImport } from '../../src/core/collection'
import {
  isAllowedSpotifyBrowserUrl,
  readSpotifySearch,
} from '../../src/main/integrations/spotify/browser'

describe('search providers and independent API cooldown', () => {
  it.each(['browser', 'api'] as const)(
    'refreshes cached %s results manually and shares the fresh response between duplicates',
    async (provider) => {
      vi.useFakeTimers()
      const store = new Store(':memory:')
      const search = vi.fn(async () => [])
      const jobs = new Jobs(
        store,
        { connected: () => true, search } as unknown as Spotify,
        () => {},
        { search, stop: vi.fn() },
      )
      try {
        store.setValue('preferences', {
          ...store.settings(),
          searchProvider: provider,
          searchDelayMs: 1000,
        })
        const id = store.import(parseImport('Artist - Song\nArtist - Song', '.txt', 'Refresh'))
        const original = store.get(id)
        const ids = original.rows.map((row) => row.id)
        const cached = [
          {
            uri: 'spotify:track:' + 'a'.repeat(22),
            title: 'Old result',
            artists: ['Artist'],
            duration: 180,
            album: '',
            url: '',
          },
        ]
        const cacheKey =
          (provider === 'browser' ? 'spotify-browser-v1:' : 'spotify-search-v1:') + 'Artist Song'
        store.cache(cacheKey, cached)
        const backgroundId = jobs.search(id, ids, true)
        await vi.advanceTimersByTimeAsync(2000)
        expect(store.job(backgroundId).state).toBe('complete')
        expect(search).not.toHaveBeenCalled()
        expect(store.row(id, ids[0]).working.candidates).toEqual(cached)

        const manualId = jobs.search(id, ids)
        await vi.advanceTimersByTimeAsync(2000)
        expect(store.job(manualId)).toMatchObject({ state: 'complete', refreshSearchResults: true })
        expect(search).toHaveBeenCalledExactlyOnceWith('Artist Song')
        expect(store.get(id).rows.every((row) => row.working.candidates.length === 0)).toBe(true)
        expect(store.cached(cacheKey)).toEqual([])
        expect(store.get(id).sourceHash).toBe(original.sourceHash)
        expect(store.get(id).rows.map((row) => row.source)).toEqual(
          original.rows.map((row) => row.source),
        )
      } finally {
        jobs.shutdown()
        store.close()
        vi.useRealTimers()
      }
    },
  )
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

  it('allows only HTTPS Spotify/reCAPTCHA endpoints and about:blank in SpotifyBrowser navigation policy', () => {
    expect(isAllowedSpotifyBrowserUrl('about:blank')).toBe(true)
    expect(isAllowedSpotifyBrowserUrl('https://open.spotify.com/search')).toBe(true)
    expect(isAllowedSpotifyBrowserUrl('https://accounts.spotify.com/authorize')).toBe(true)
    expect(isAllowedSpotifyBrowserUrl('https://www.google.com/recaptcha/api2/anchor')).toBe(true)
    expect(isAllowedSpotifyBrowserUrl('https://www.recaptcha.net/recaptcha/api.js')).toBe(true)
    expect(isAllowedSpotifyBrowserUrl('https://www.gstatic.com/recaptcha/releases/v1.js')).toBe(
      true,
    )

    expect(isAllowedSpotifyBrowserUrl('http://open.spotify.com/search')).toBe(false)
    expect(isAllowedSpotifyBrowserUrl('https://docs.google.com/document/d/1')).toBe(false)
    expect(isAllowedSpotifyBrowserUrl('https://sites.google.com/view/test')).toBe(false)
    expect(isAllowedSpotifyBrowserUrl('https://www.google.com/search?q=spotify')).toBe(false)
    expect(isAllowedSpotifyBrowserUrl('https://user:pass@open.spotify.com/search')).toBe(false)
    expect(isAllowedSpotifyBrowserUrl('not-a-url')).toBe(false)
  })

  it('returns ready instead of incomplete when non-track rows coexist with valid track rows', () => {
    const originalLocation = globalThis.location
    const originalDocument = globalThis.document
    try {
      const id = 'a'.repeat(22)
      const validRow = {
        querySelector: (selector: string) => {
          if (selector === 'a[href*="/track/"]') {
            return { pathname: `/track/${id}`, textContent: 'Valid Song' }
          }
          if (selector === 'a[href*="/album/"]') return { textContent: 'Valid Album' }
          return null
        },
        querySelectorAll: (selector: string) => {
          if (selector === 'a[href*="/artist/"]') return [{ textContent: 'Valid Artist' }]
          if (selector === 'div, span') return [{ textContent: '3:12' }]
          return []
        },
      }
      const nonTrackRow = {
        querySelector: () => null,
        querySelectorAll: () => [],
      }

      globalThis.location = {
        hostname: 'open.spotify.com',
        pathname: '/search/' + encodeURIComponent('Valid Artist Valid Song') + '/tracks',
      } as unknown as Location
      globalThis.document = {
        body: { innerText: '' },
        querySelectorAll: (selector: string) => {
          if (selector === '[data-testid="tracklist-row"]') return [validRow, nonTrackRow]
          return []
        },
      } as unknown as Document

      const result = readSpotifySearch('Valid Artist Valid Song')
      expect(result.kind).toBe('ready')
      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0]).toMatchObject({
        uri: 'spotify:track:' + id,
        title: 'Valid Song',
        artists: ['Valid Artist'],
        duration: 192,
      })

      globalThis.document = {
        body: { innerText: '' },
        querySelectorAll: (selector: string) => {
          if (selector === '[data-testid="tracklist-row"]') return [nonTrackRow]
          return []
        },
      } as unknown as Document
      expect(readSpotifySearch('Valid Artist Valid Song')).toEqual({
        kind: 'incomplete',
        tracks: [],
      })
    } finally {
      globalThis.location = originalLocation
      globalThis.document = originalDocument
    }
  })
})
