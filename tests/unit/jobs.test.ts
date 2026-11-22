import { describe, it, expect, vi } from 'vitest'
vi.mock('electron', () => ({ safeStorage: {}, shell: {} }))
const reviewGroupSpy = vi.hoisted(() => vi.fn())
vi.mock('../../src/core/matching', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/matching')>()
  return {
    ...actual,
    reviewGroup: (...args: Parameters<typeof actual.reviewGroup>) => {
      reviewGroupSpy(...args)
      return actual.reviewGroup(...args)
    },
  }
})
import { Jobs } from '../../src/main/jobs/runner'
import { Store } from '../../src/main/storage'
import { Spotify, SpotifyError } from '../../src/main/integrations/spotify/api'
import { parseImport, makePlan, mixedOrder } from '../../src/core/collection'
import { reviewGroup } from '../../src/core/matching'

describe('background collection search', () => {
  it('resumes immediately and reports refusal before dispatching another runner', async () => {
    const store = new Store(':memory:')
    let finish!: (value: []) => void
    let connected = true
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Test'))
      const jobs = new Jobs(
        store,
        {
          connected: () => connected,
          search: () =>
            new Promise<[]>((resolve) => {
              finish = resolve
            }),
        } as unknown as Spotify,
        () => {},
      )
      const job = store.newJob(id, 'search', [store.get(id).rows[0].id])
      job.retryAt = Date.now() + 60000
      store.putJob(job)
      expect(() => jobs.resume(job.id)).toThrow('паузу')
      job.retryAt = undefined
      job.state = 'needs-review'
      store.putJob(job)
      expect(() => jobs.resume(job.id)).toThrow('могло выполниться')
      job.state = 'paused'
      store.putJob(job)
      connected = false
      expect(() => jobs.resume(job.id)).toThrow('Подключите Spotify')
      connected = true
      expect(jobs.resume(job.id)).toBeUndefined()
      expect(store.job(job.id).state).toBe('running')
      expect(() => jobs.resume(job.id)).toThrow('Другое задание')
      jobs.pause(job.id)
      expect(store.job(job.id).state).toBe('pausing')
      finish([])
      await vi.waitFor(() => expect(store.job(job.id).state).toBe('paused'))
    } finally {
      store.close()
    }
  })
  it('reuses real cached candidates for duplicate occurrences and respects a local-file decision', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(
        parseImport('Artist - Song\nArtist - Song\nArtist - Song', '.txt', 'Test'),
      )
      const rows = store.get(id).rows
      store.patch(id, [rows[2].id], { localPending: true })
      const candidates = [
        {
          uri: 'spotify:track:' + 'a'.repeat(22),
          title: 'Song',
          artists: ['Artist'],
          duration: 180,
          album: '',
          url: '',
        },
      ]
      store.cache('spotify-search-v1:Artist Song', candidates)
      const search = vi.fn(async () => {
        throw new Error('Cached data must not request Spotify again')
      })
      const jobs = new Jobs(
        store,
        { connected: () => true, search } as unknown as Spotify,
        () => {},
      )
      const job = store.newJob(
        id,
        'search',
        rows.map((row) => row.id),
      )
      job.backgroundSearch = true
      store.putJob(job)
      await jobs.run(job.id)
      const result = store.get(id).rows
      expect(search).not.toHaveBeenCalled()
      expect(result[0].working.candidates).toEqual(candidates)
      expect(result[1].working.candidates).toEqual(candidates)
      expect(result[2].working.searchedQuery).toBeNull()
      expect(result.every((row) => row.working.destination === 'unresolved')).toBe(true)
      expect(store.job(job.id).state).toBe('complete')
    } finally {
      store.close()
    }
  })
  it('persists an empty successful result so it is not confused with an unsearched track', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('Artist - Missing', '.txt', 'Test'))
      const row = store.get(id).rows[0]
      const jobs = new Jobs(
        store,
        { connected: () => true, search: async () => [] } as unknown as Spotify,
        () => {},
      )
      const job = store.newJob(id, 'search', [row.id])
      await jobs.run(job.id)
      expect(reviewGroup(store.row(id, row.id))).toBe('missing')
      expect(store.row(id, row.id).working.searchedQuery).toBe('Artist Missing')
    } finally {
      store.close()
    }
  })
})

describe('migration recovery', () => {
  it('keeps found results on quota exhaustion and prevents another job from bypassing the deadline', async () => {
    const store = new Store(':memory:')
    const now = vi.spyOn(Date, 'now')
    const started = Date.now()
    now.mockReturnValue(started)
    try {
      const id = store.import(parseImport('Artist - Cached\nArtist - Limited', '.txt', 'Quota'))
      const original = store.get(id)
      store.cache('spotify-search-v1:Artist Cached', [])
      let limited = true
      const search = vi.fn(async () => {
        if (limited) throw new SpotifyError('Квота Spotify исчерпана.', 12000, false, 'quota')
        return []
      })
      const fake = { connected: () => true, search } as unknown as Spotify
      const jobs = new Jobs(store, fake, () => {})
      const job = store.newJob(
        id,
        'search',
        original.rows.map((row) => row.id),
      )
      await jobs.run(job.id)
      const saved = store.job(job.id)
      expect(saved).toMatchObject({
        cursor: 1,
        state: 'paused',
        waitReason: 'quota',
        retryAt: started + 12000000,
      })
      jobs.pause(job.id)
      expect(store.job(job.id).message).toBe(saved.message)
      expect(store.get(id).rows[0].working.searchedQuery).toBe('Artist Cached')
      expect(store.get(id).sourceHash).toBe(original.sourceHash)
      const other = store.import(parseImport('Artist - Other', '.txt', 'Other'))
      const restarted = new Jobs(store, fake, () => {})
      expect(() => restarted.search(other, [store.get(other).rows[0].id])).toThrow('паузу')
      expect(() => restarted.resume(job.id)).toThrow('паузу')
      expect(store.jobs()).toHaveLength(1)
      expect(search).toHaveBeenCalledTimes(1)
      now.mockReturnValue(saved.retryAt!)
      limited = false
      await restarted.run(job.id)
      expect(store.job(job.id)).toMatchObject({ cursor: 2, state: 'complete' })
      expect(store.job(job.id).retryAt).toBeUndefined()
      expect(store.job(job.id).waitReason).toBeUndefined()
      expect(search).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
      store.close()
    }
  })
  it('persists and enforces the Spotify retry window', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Test')),
        row = store.get(id).rows[0]
      let calls = 0
      const fake = {
        connected: () => true,
        search: async () => {
          calls++
          throw new SpotifyError('Rate limit', 60)
        },
      } as unknown as Spotify
      const jobs = new Jobs(store, fake, () => {}),
        job = store.newJob(id, 'search', [row.id])
      await jobs.run(job.id)
      expect(store.job(job.id).retryAt).toBeGreaterThan(Date.now())
      await expect(jobs.run(job.id)).rejects.toThrow('паузу')
      expect(calls).toBe(1)
    } finally {
      store.close()
    }
  })
  it('does not append a batch twice after a lost write response', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B\nA - B', '.txt', 'Test')),
        rows = store.get(id).rows
      const uri = 'spotify:track:' + 'a'.repeat(22)
      store.patch(
        id,
        rows.map((r) => r.id),
        {
          destination: 'spotify',
          spotify: { uri, title: 'B', artists: ['A'], album: '', url: '', duration: 200 },
        },
      )
      const actual: string[] = []
      let posts = 0
      const fake = {
        connected: () => true,
        playlistItems: async () => [...actual],
        request: async (_path: string, method: string, body: { uris: string[] }) => {
          if (method === 'POST') {
            actual.push(...body.uris)
            posts++
            throw new SpotifyError('Lost response', 0, true)
          }
        },
      } as unknown as Spotify
      const jobs = new Jobs(store, fake, () => {})
      const job = store.newJob(
        id,
        'transfer',
        rows.map((r) => r.id),
      )
      job.plan = makePlan(store.get(id))
      job.playlistId = 'already-created'
      store.putJob(job)
      await jobs.run(job.id)
      expect(store.job(job.id).state).toBe('paused')
      await jobs.run(job.id)
      expect(store.job(job.id).state).toBe('complete')
      expect(actual).toEqual([uri, uri])
      expect(posts).toBe(1)
    } finally {
      store.close()
    }
  })
  it('refuses another create after an ambiguous playlist creation', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Test')),
        row = store.get(id).rows[0]
      store.patch(id, [row.id], {
        destination: 'spotify',
        spotify: {
          uri: 'spotify:track:' + 'a'.repeat(22),
          title: 'B',
          artists: ['A'],
          album: '',
          url: '',
          duration: 200,
        },
      })
      let calls = 0
      const fake = {
        connected: () => true,
        request: async () => {
          calls++
          throw new SpotifyError('Lost create response', 0, true)
        },
      } as unknown as Spotify
      const jobs = new Jobs(store, fake, () => {}),
        job = store.newJob(id, 'transfer', [row.id])
      job.plan = makePlan(store.get(id))
      store.putJob(job)
      await jobs.run(job.id)
      expect(store.job(job.id).state).toBe('needs-review')
      await expect(jobs.run(job.id)).rejects.toThrow('могло выполниться')
      expect(calls).toBe(1)
    } finally {
      store.close()
    }
  })
  it('strictly maps mixed local and catalog occurrences before moving any items', () => {
    const c = parseImport('A - B\nC - D\nA - B', '.txt', 'Test')
    const store = new Store(':memory:')
    try {
      const id = store.import(c),
        rows = store.get(id).rows,
        uri = 'spotify:track:' + 'a'.repeat(22)
      store.patch(id, [rows[0].id, rows[2].id], {
        spotify: { uri, title: 'B', artists: ['A'], album: '', url: '', duration: 200 },
        destination: 'spotify',
      })
      store.patch(id, [rows[1].id], {
        destination: 'local',
        local: {
          path: 'D:/D.mp3',
          sha256: 'test',
          artist: 'C',
          title: 'D',
          duration: 180.4,
          codec: 'MP3',
          bitrate: null,
          size: 1,
        },
      })
      const plan = makePlan(store.get(id)),
        local = 'spotify:local:C::D:180'
      expect(mixedOrder(plan, [uri, uri, local])).toEqual([uri, local, uri])
      expect(() => mixedOrder(plan, [uri, uri])).toThrow('Добавьте')
      expect(() => mixedOrder(plan, [uri, uri, 'spotify:local:C::Other:180'])).toThrow('не начата')
      expect(() => mixedOrder(plan, [uri, uri, 'spotify:local:100%::D:180'])).toThrow('не начата')
    } finally {
      store.close()
    }
  })

  it('handles NFC/case differences and rejects empty local URI durations in mixedOrder', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('Café - Song', '.txt', 'NFC'))
      const row = store.get(id).rows[0]
      store.patch(id, [row.id], {
        destination: 'local',
        local: {
          path: 'D:/cafe.mp3',
          sha256: 'test',
          artist: 'Cafe\u0301',
          title: 'Song',
          duration: 0,
          codec: 'MP3',
          bitrate: null,
          size: 1,
        },
      })
      const plan = makePlan(store.get(id))
      expect(() => mixedOrder(plan, ['spotify:local:Cafe%CC%81::Song:'])).toThrow('не начата')
      expect(
        mixedOrder(plan, [
          `spotify:local:${encodeURIComponent('café')}::${encodeURIComponent('SONG')}:0`,
        ]),
      ).toHaveLength(1)
    } finally {
      store.close()
    }
  })

  it('tracks isActive and isBusyWithCollection during reconcileMixed and handles 429 retryAfter', async () => {
    const store = new Store(':memory:')
    const changed = vi.fn()
    try {
      const id = store.import(parseImport('A - First\nB - Second', '.txt', 'Reconcile'))
      const rows = store.get(id).rows
      const uri = 'spotify:track:' + 'a'.repeat(22)
      store.patch(id, [rows[0].id], {
        destination: 'spotify',
        spotify: { uri, title: 'First', artists: ['A'], album: '', url: '', duration: 200 },
      })
      store.patch(id, [rows[1].id], {
        destination: 'local',
        local: {
          path: 'D:/second.mp3',
          sha256: 'test',
          artist: 'B',
          title: 'Second',
          duration: 180,
          codec: 'MP3',
          bitrate: null,
          size: 1,
        },
      })

      let resolveMove!: () => void
      let rejectWith429 = false
      const fake = {
        connected: () => true,
        playlistItems: async () => ['spotify:local:B::Second:180', uri],
        request: () =>
          new Promise<void>((resolve, reject) => {
            resolveMove = () => {
              if (rejectWith429) reject(new SpotifyError('Rate limit', 30, false, 'rate-limit'))
              else resolve()
            }
          }),
      } as unknown as Spotify

      const jobs = new Jobs(store, fake, changed)
      const job = store.newJob(id, 'transfer', [rows[0].id])
      job.plan = makePlan(store.get(id))
      job.playlistId = 'playlist-id'
      job.state = 'complete'
      store.putJob(job)

      expect(jobs.isActive(job.id)).toBe(false)
      expect(jobs.isBusyWithCollection(id)).toBe(false)

      const pending = jobs.reconcileMixed(job.id)
      await vi.waitFor(() => expect(resolveMove).toBeTypeOf('function'))

      expect(jobs.isActive(job.id)).toBe(true)
      expect(jobs.isBusyWithCollection(id)).toBe(true)
      expect(jobs.isBusyWithCollection('other-collection')).toBe(false)

      rejectWith429 = true
      resolveMove()
      await expect(pending).rejects.toThrow('Rate limit')

      expect(jobs.isActive(job.id)).toBe(false)
      expect(jobs.isBusyWithCollection(id)).toBe(false)
      expect(store.value('spotify-api-retryAt', 0)).toBeGreaterThan(Date.now())
      expect(changed).toHaveBeenCalled()

      store.putJob({ ...store.job(job.id), state: 'pausing' })
      expect(jobs.isActive(job.id)).toBe(true)
      expect(jobs.isBusyWithCollection(id)).toBe(true)
    } finally {
      store.close()
    }
  })

  it('skips deleted rows on paused search resume, passes matchingRules, and does not flicker running on pause', async () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('Artist 1 - Song 1\nArtist 2 - Song 2', '.txt', 'Resume'))
      const [row1, row2] = store.get(id).rows
      store.setValue('preferences', {
        ...store.settings(),
        matchingRules: { ...store.settings().matchingRules, transliteration: false },
      })

      const job = store.newJob(id, 'search', [row1.id, row2.id])
      job.backgroundSearch = true
      store.putJob(job)

      // Repair removes untouched row1 while preserving row2's id.
      store.repairCollection(id, parseImport('Artist 2 - Song 2', '.txt', 'Repaired'))
      expect(() => store.row(id, row1.id)).toThrow()

      let releaseSearch!: (value: []) => void
      const search = vi.fn(
        () =>
          new Promise<[]>((resolve) => {
            releaseSearch = resolve
          }),
      )
      const jobs = new Jobs(
        store,
        { connected: () => true, search } as unknown as Spotify,
        () => {},
      )
      const statesAfterPause: string[] = []
      let pausedIssued = false
      const originalPutJob = store.putJob.bind(store)
      vi.spyOn(store, 'putJob').mockImplementation((nextJob) => {
        if (pausedIssued) statesAfterPause.push(nextJob.state)
        originalPutJob(nextJob)
      })

      reviewGroupSpy.mockClear()
      const runPromise = jobs.run(job.id)
      await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
      expect(reviewGroupSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: row2.id }),
        expect.objectContaining({ transliteration: false }),
      )

      pausedIssued = true
      jobs.pause(job.id)
      releaseSearch([])
      await runPromise

      expect(statesAfterPause).not.toContain('running')
      expect(store.job(job.id)).toMatchObject({ cursor: 2, state: 'paused' })

      // Resume from cursor=2 finishes cleanly.
      await jobs.run(job.id)
      expect(store.job(job.id).state).toBe('complete')
    } finally {
      store.close()
    }
  })
})
