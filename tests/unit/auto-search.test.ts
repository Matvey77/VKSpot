import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('electron', () => ({ safeStorage: {}, shell: {} }))
import { Jobs } from '../../src/main/jobs'
import { Store } from '../../src/main/store'
import { Spotify, SpotifyError } from '../../src/main/spotify'
import { parseImport } from '../../src/core/collection'

function cleanup(directory: string): void {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-auto-')
  )
    throw new Error('Unsafe cleanup target')
  rmSync(directory, { recursive: true, force: true })
}

describe('automatic background search continuation', () => {
  it('recovers an interrupted background job from disk while keeping a manually paused job stopped', async () => {
    vi.useFakeTimers()
    const directory = mkdtempSync(join(tmpdir(), 'vkspot-auto-'))
    const database = join(directory, 'collection.db')
    let store = new Store(database)
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Restart'))
      const rowId = store.get(id).rows[0].id
      const job = store.newJob(id, 'search', [rowId])
      store.putJob({ ...job, state: 'running', backgroundSearch: true })
      store.close()
      store = new Store(database)
      expect(store.job(job.id)).toMatchObject({ state: 'paused', autoResume: true })
      const search = vi.fn(async () => [])
      const fake = { connected: () => true, search } as unknown as Spotify
      jobs = new Jobs(store, fake, () => {})
      await vi.advanceTimersByTimeAsync(1)
      expect(store.job(job.id).state).toBe('complete')
      jobs.shutdown()
      const manual = store.newJob(id, 'search', [rowId])
      store.putJob({ ...manual, state: 'pausing', backgroundSearch: true, autoResume: false })
      store.close()
      store = new Store(database)
      jobs = new Jobs(store, fake, () => {})
      await vi.advanceTimersByTimeAsync(10000)
      expect(store.job(manual.id)).toMatchObject({ state: 'paused', autoResume: false })
      expect(search).toHaveBeenCalledTimes(1)
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
      cleanup(directory)
    }
  })
  it('does not re-arm automatic continuation when an in-flight request finishes after manual pause', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - First\nA - Second', '.txt', 'Pause'))
      let finish!: (value: []) => void
      const search = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<[]>((resolve) => {
              finish = resolve
            }),
        )
        .mockResolvedValue([])
      jobs = new Jobs(store, { connected: () => true, search } as unknown as Spotify, () => {})
      const jobId = jobs.search(
        id,
        store.get(id).rows.map((row) => row.id),
        true,
      )
      jobs.pause(jobId)
      finish([])
      await vi.advanceTimersByTimeAsync(10000)
      expect(store.job(jobId)).toMatchObject({ cursor: 1, state: 'paused', autoResume: false })
      expect(search).toHaveBeenCalledTimes(1)
      jobs.resume(jobId)
      await vi.advanceTimersByTimeAsync(1)
      expect(search).toHaveBeenCalledTimes(2)
      expect(store.job(jobId).state).toBe('complete')
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('is enabled for old preferences and resumes exactly at Retry-After, including repeated limits', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      store.setValue('preferences', { searchDelayMs: 1000 })
      expect(store.settings().autoResumeSearch).toBe(true)
      const id = store.import(parseImport('A - B', '.txt', 'Auto'))
      const search = vi
        .fn()
        .mockRejectedValueOnce(new SpotifyError('Quota', 2, false, 'quota'))
        .mockRejectedValueOnce(new SpotifyError('Rate limit', 3, false, 'rate-limit'))
        .mockResolvedValue([])
      jobs = new Jobs(store, { connected: () => true, search } as unknown as Spotify, () => {})
      const job = store.newJob(id, 'search', [store.get(id).rows[0].id])
      job.backgroundSearch = true
      store.putJob(job)
      await jobs.run(job.id)
      expect(store.job(job.id).state).toBe('paused')
      await vi.advanceTimersByTimeAsync(1999)
      expect(search).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(search).toHaveBeenCalledTimes(2)
      expect(store.job(job.id).waitReason).toBe('rate-limit')
      await vi.advanceTimersByTimeAsync(2999)
      expect(search).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(search).toHaveBeenCalledTimes(3)
      expect(store.job(job.id)).toMatchObject({ cursor: 1, state: 'complete', autoResume: false })
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('preserves manual pause, obeys the off switch and never retries a non-quota failure', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Auto'))
      const search = vi
        .fn()
        .mockRejectedValueOnce(new SpotifyError('Quota', 2))
        .mockRejectedValue(new Error('Offline'))
      jobs = new Jobs(store, { connected: () => true, search } as unknown as Spotify, () => {})
      const job = store.newJob(id, 'search', [store.get(id).rows[0].id])
      job.backgroundSearch = true
      store.putJob(job)
      await jobs.run(job.id)
      jobs.pause(job.id)
      await vi.advanceTimersByTimeAsync(5000)
      expect(search).toHaveBeenCalledTimes(1)
      expect(store.job(job.id).autoResume).toBe(false)
      await jobs.run(job.id)
      await vi.advanceTimersByTimeAsync(60000)
      expect(search).toHaveBeenCalledTimes(2)
      expect(store.job(job.id).autoResume).toBe(false)
      store.putJob({ ...store.job(job.id), retryAt: Date.now() + 2000, autoResume: true })
      store.setValue('preferences', { ...store.settings(), autoResumeSearch: false })
      jobs.wake()
      await vi.advanceTimersByTimeAsync(5000)
      expect(search).toHaveBeenCalledTimes(2)
      store.setValue('preferences', { ...store.settings(), autoResumeSearch: true })
      jobs.wake()
      await vi.advanceTimersByTimeAsync(1)
      expect(search).toHaveBeenCalledTimes(3)
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('restores a legacy quota wait and waits for a verified connection without polling Spotify', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Legacy'))
      const job = store.newJob(id, 'search', [store.get(id).rows[0].id])
      store.putJob({ ...job, backgroundSearch: true, retryAt: Date.now() + 2000 })
      let connected = false
      const search = vi.fn(async () => [])
      jobs = new Jobs(store, { connected: () => connected, search } as unknown as Spotify, () => {})
      await vi.advanceTimersByTimeAsync(5000)
      expect(search).not.toHaveBeenCalled()
      connected = true
      jobs.wake()
      await vi.advanceTimersByTimeAsync(1)
      expect(search).toHaveBeenCalledTimes(1)
      expect(store.job(job.id).state).toBe('complete')
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
  it('shutdown cancels the timer and transfers are never automatically resumed', async () => {
    vi.useFakeTimers()
    const store = new Store(':memory:')
    let jobs: Jobs | undefined
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Transfer'))
      const job = store.newJob(id, 'transfer', [store.get(id).rows[0].id])
      store.putJob({ ...job, retryAt: Date.now() + 1000 })
      const search = vi.fn()
      const request = vi.fn()
      jobs = new Jobs(
        store,
        { connected: () => true, search, request } as unknown as Spotify,
        () => {},
      )
      await vi.advanceTimersByTimeAsync(5000)
      expect(request).not.toHaveBeenCalled()
      const pending = store.newJob(id, 'search', [store.get(id).rows[0].id])
      store.putJob({ ...pending, backgroundSearch: true, retryAt: Date.now() + 1000 })
      jobs.wake()
      jobs.shutdown()
      await vi.advanceTimersByTimeAsync(5000)
      expect(search).not.toHaveBeenCalled()
    } finally {
      jobs?.shutdown()
      store.close()
      vi.useRealTimers()
    }
  })
})
