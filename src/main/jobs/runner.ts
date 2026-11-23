import { makePlan, reconcilePrefix, mixedOrder } from '../../core/collection'
import { searchText, reviewGroup } from '../../core/matching'
import type { Job, TrackRow, Working } from '../../shared/model'
import { formatRecordsCount } from '../../shared/ru'
import type { Store } from '../storage'
import type { WorkingPatchItem } from '../storage/collection-repository'
import { Spotify, SpotifyError } from '../integrations/spotify/api'
import { autoSearch, jobMessage, waitingJob } from '../../shared/job-status'
import type { SpotifyBrowser } from '../integrations/spotify/browser'

const SEARCH_BATCH_SIZE = 50
const SEARCH_BATCH_WINDOW_MS = 150

export class Jobs {
  private active: string | null = null
  private activeCollectionId: string | null = null
  private interrupted = new Set<string>()
  private lastNotification = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopping = false
  constructor(
    private store: Store,
    private spotify: Spotify,
    private changed: () => void,
    private browser?: Pick<SpotifyBrowser, 'search' | 'stop'>,
  ) {
    this.wake()
  }
  isActive(jobId: string): boolean {
    if (this.active === jobId) return true
    return this.store
      .jobSummaries()
      .some((job) => job.id === jobId && (job.state === 'running' || job.state === 'pausing'))
  }
  isBusyWithCollection(collectionId: string): boolean {
    if (this.activeCollectionId === collectionId) return true
    return this.store
      .jobSummaries()
      .some(
        (job) =>
          job.collectionId === collectionId &&
          (job.id === this.active || job.state === 'running' || job.state === 'pausing'),
      )
  }
  wake(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.stopping || this.active || !this.store.settings().autoResumeSearch) return
    const jobs = this.store.jobSummaries()
    const now = Date.now()
    const candidate = [...jobs]
      .reverse()
      .filter(
        (job) =>
          job.state === 'paused' &&
          autoSearch(job, true) &&
          (job.searchProvider === 'browser' ? !!this.browser : this.spotify.connected()),
      )
      .map((job) => ({
        job,
        deadline:
          job.searchProvider === 'browser'
            ? Math.max(job.retryAt ?? 0, this.store.value('spotify-browser-retryAt', 0))
            : Math.max(
                job.retryAt ?? 0,
                waitingJob(jobs, now)?.retryAt ?? 0,
                this.store.value('spotify-api-retryAt', 0),
              ),
      }))
      .sort((a, b) => a.deadline - b.deadline)[0]
    if (!candidate) return
    const delay =
      candidate.deadline >= now ? Math.min(2147483647, Math.max(50, candidate.deadline - now)) : 0
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.stopping) return
      try {
        this.resume(candidate.job.id)
      } catch {
        this.wake()
      }
    }, delay)
    this.timer.unref?.()
  }
  private save(job: Job, progressOnly = false): void {
    // Preserve an in-flight pause if a request finishes with an older runner snapshot.
    if (this.active === job.id && this.interrupted.has(job.id)) {
      const stored = this.store.job(job.id)
      if (stored.autoResume === false) job.autoResume = false
      if (job.state === 'running' && stored.state === 'pausing') job.state = 'pausing'
    }
    this.store.putJob(job, progressOnly)
    if (job.state !== 'running' || Date.now() - this.lastNotification >= 1200) {
      this.lastNotification = Date.now()
      this.changed()
    }
    this.wake()
  }
  pause(id: string, manual = true): void {
    const job = this.store.job(id)
    if (manual) job.autoResume = false
    if (job.state === 'paused' && job.retryAt && job.retryAt > Date.now()) {
      this.save(job, true)
      return
    }
    this.interrupted.add(id)
    if (this.active === id && job.searchProvider === 'browser') this.browser?.stop()
    if (job.state !== 'complete')
      this.save(
        {
          ...job,
          state: this.active === id ? 'pausing' : 'paused',
          message: 'Приостановлено. Текущий запрос завершится и будет сохранён.',
        },
        true,
      )
  }
  search(collectionId: string, rowIds: string[], background = false): string {
    if (this.active) throw new Error('Другое задание уже работает. Приостанови его.')
    const provider = this.browser ? this.store.settings().searchProvider : 'api'
    if (provider === 'api') {
      if (!this.spotify.connected()) throw new Error('Подключи Spotify для поиска через API.')
      this.checkCooldown()
    } else this.checkBrowserCooldown()
    const collection = this.store.get(collectionId),
      valid = new Set(collection.rows.map((r) => r.id))
    if (!rowIds.length || rowIds.some((id) => !valid.has(id)))
      throw new Error('Выбери записи из этой коллекции.')
    const job = this.store.newJob(collectionId, 'search', [...new Set(rowIds)])
    job.backgroundSearch = background
    job.refreshSearchResults = !background
    job.autoResume = background
    job.searchProvider = provider
    this.store.putJob(job, true)
    void this.run(job.id).catch(() => undefined)
    return job.id
  }
  transfer(collectionId: string): string {
    if (this.active) throw new Error('Другое задание уже работает. Приостанови его.')
    if (!this.spotify.connected()) throw new Error('Для переноса через API подключи Spotify.')
    this.checkCooldown()
    const plan = makePlan(this.store.get(collectionId))
    if (!plan.length) throw new Error('Нет записей для переноса.')
    const remote = plan.filter((p) => p.destination === 'spotify')
    if (!remote.length)
      throw new Error('В плане только локальные записи. Используй подготовку локальных файлов.')
    if (
      this.store
        .jobSummaries()
        .some(
          (j) => j.collectionId === collectionId && j.kind === 'transfer' && j.state !== 'complete',
        )
    )
      throw new Error('У этой коллекции уже есть незавершённый перенос. Продолжи его в заданиях.')
    const job = this.store.newJob(
      collectionId,
      'transfer',
      remote.map((r) => r.rowId),
    )
    job.plan = plan
    job.total = remote.length
    this.save(job)
    void this.run(job.id).catch(() => undefined)
    return job.id
  }
  private runnable(id: string): Job {
    if (this.active) throw new Error('Другое задание уже работает. Приостанови его перед запуском.')
    const job = this.store.job(id)
    if (job.state === 'complete') return job
    if (job.searchProvider !== 'browser') this.checkCooldown()
    else this.checkBrowserCooldown()
    if (job.state === 'needs-review')
      throw new Error(
        'Создание плейлиста могло выполниться. Проверь Spotify; автоматический повтор отключён, чтобы не создать второй плейлист.',
      )
    return job
  }
  private checkCooldown(): void {
    const now = Date.now()
    const waiting = waitingJob(this.store.jobSummaries(), now)
    if (waiting) throw new Error('Spotify запросил паузу. ' + jobMessage(waiting, now))
    if (this.store.value('spotify-api-retryAt', 0) > now)
      throw new Error(
        'Квота Spotify API пока не восстановилась. Поиск через страницу Spotify доступен отдельно; перенос нужно повторить позже.',
      )
  }
  private findRow(collectionId: string, rowId: string): TrackRow | null {
    try {
      return this.store.row(collectionId, rowId)
    } catch {
      return null
    }
  }
  private checkBrowserCooldown(): void {
    const deadline = this.store.value('spotify-browser-retryAt', 0)
    if (deadline > Date.now())
      throw new Error(
        `Страница Spotify попросила подождать до ${new Date(deadline).toLocaleString('ru-RU')}. Прогресс сохранён.`,
      )
  }
  continueInBrowser(id: string): void {
    if (!this.browser) throw new Error('Поиск через страницу Spotify недоступен.')
    if (this.active) throw new Error('Сначала приостанови текущее задание.')
    const job = this.store.job(id)
    if (job.kind !== 'search' || job.state !== 'paused')
      throw new Error('Этот поиск нельзя переключить.')
    if (job.searchProvider !== 'browser' && job.retryAt)
      this.store.setValue(
        'spotify-api-retryAt',
        Math.max(job.retryAt, this.store.value('spotify-api-retryAt', 0)),
      )
    job.searchProvider = 'browser'
    delete job.retryAt
    delete job.waitReason
    this.store.putJob(job, true)
    this.resume(id)
  }
  resume(id: string): void {
    const job = this.runnable(id)
    if (job.state === 'complete') return
    if (job.searchProvider !== 'browser' && !this.spotify.connected())
      throw new Error('Подключи Spotify для продолжения задания.')
    // Validate synchronously so IPC reports refusals, then release the UI while
    // the runner persists progress and any subsequent network error.
    void this.run(id).catch(() => undefined)
  }
  async run(id: string): Promise<void> {
    let job = this.runnable(id)
    if (job.state === 'complete') return
    this.active = id
    this.activeCollectionId = job.collectionId
    this.interrupted.delete(id)
    delete job.retryAt
    delete job.waitReason
    job.autoResume = job.kind === 'search' && job.backgroundSearch === true
    job.state = 'running'
    job.message = 'Выполняется…'
    this.save(job, true)
    try {
      if (job.kind === 'search') {
        // Manual searches refresh Spotify, while repeats within this run still
        // share one response. Background jobs can reuse the persistent cache.
        const refreshed = new Map<string, Awaited<ReturnType<Spotify['search']>>>()
        let pendingUpdates: WorkingPatchItem[] = []
        const pendingIds = new Set<string>()
        let pendingSteps = 0
        let batchStartedAt = 0

        const flushBatch = (saveProgress = true) => {
          if (pendingUpdates.length) {
            this.store.patchMany(job.collectionId, pendingUpdates, false)
            pendingUpdates = []
            pendingIds.clear()
          }
          if (pendingSteps > 0) {
            job.message = `Кандидаты: ${job.cursor} из ${job.total}. Версии подтверждаются вручную.`
            if (saveProgress) this.save(job, true)
            pendingSteps = 0
          }
          batchStartedAt = 0
        }

        const queueRowPatch = (rowId: string, patch: Partial<Working>) => {
          pendingUpdates.push({ id: rowId, patch })
          pendingIds.add(rowId)
        }

        while (job.cursor < job.rowIds.length && !this.interrupted.has(id)) {
          const rowId = job.rowIds[job.cursor]
          if (pendingIds.has(rowId)) flushBatch()
          const row = this.findRow(job.collectionId, rowId)
          let requested = false
          let directPatch: Partial<Working> | undefined
          if (
            row &&
            !row.working.excluded &&
            (!job.backgroundSearch ||
              reviewGroup(row, this.store.settings().matchingRules) === 'pending')
          ) {
            const query = searchText(row.working)
            if (query.trim()) {
              const cacheKey =
                (job.searchProvider === 'browser' ? 'spotify-browser-v1:' : 'spotify-search-v1:') +
                query
              let results = job.refreshSearchResults
                ? refreshed.get(cacheKey)
                : this.store.cached<Awaited<ReturnType<Spotify['search']>>>(cacheKey)
              if (!results) {
                // Flush cached/skipped batch before hitting the network so failures keep prior progress.
                flushBatch()
                requested = true
                results =
                  job.searchProvider === 'browser'
                    ? await this.browser!.search(query)
                    : await this.spotify.search(query)
                this.store.cache(cacheKey, results)
                if (job.refreshSearchResults) refreshed.set(cacheKey, results)
                const current = this.findRow(job.collectionId, row.id)
                if (current && searchText(current.working) === query) {
                  directPatch = { candidates: results, searchedQuery: query }
                }
              } else {
                queueRowPatch(row.id, { candidates: results, searchedQuery: query })
              }
            } else {
              queueRowPatch(row.id, { searchedQuery: query })
            }
          }

          if (requested) {
            if (directPatch) this.store.patch(job.collectionId, [row!.id], directPatch, false)
            job.cursor++
            job.message = `Кандидаты: ${job.cursor} из ${job.total}. Версии подтверждаются вручную.`
            this.save(job, true)
            if (job.cursor < job.total) {
              const until = Date.now() + this.store.settings().searchDelayMs
              while (Date.now() < until && !this.interrupted.has(id))
                await new Promise((resolve) =>
                  setTimeout(resolve, Math.min(250, until - Date.now())),
                )
            }
          } else {
            job.cursor++
            if (pendingSteps === 0) batchStartedAt = Date.now()
            pendingSteps++
            if (
              pendingSteps >= SEARCH_BATCH_SIZE ||
              Date.now() - batchStartedAt >= SEARCH_BATCH_WINDOW_MS
            ) {
              flushBatch()
              await new Promise<void>((resolve) => setImmediate(resolve))
            }
          }
        }
        flushBatch(false)
      } else {
        const expected = job.plan!.filter((p) => p.destination === 'spotify').map((p) => p.uri!)
        if (!job.playlistId) {
          const p = await this.spotify.request<{ id: string }>('/me/playlists', 'POST', {
            name: this.store.settings().playlistName,
            public: false,
            description: `VKSpot transfer ${job.id}`,
          })
          job.playlistId = p.id
          this.save(job, true)
        }
        const actual = await this.spotify.playlistItems(job.playlistId)
        job.cursor = reconcilePrefix(expected, actual)
        this.save(job, true)
        while (job.cursor < expected.length && !this.interrupted.has(id)) {
          const batch = expected.slice(job.cursor, job.cursor + 100)
          await this.spotify.request(`/playlists/${job.playlistId}/items`, 'POST', { uris: batch })
          job.cursor = reconcilePrefix(expected, await this.spotify.playlistItems(job.playlistId))
          job.message = `Сверено ${job.cursor} из ${job.total}.`
          this.save(job, true)
        }
      }
      const paused = this.interrupted.has(id)
      job.autoResume = paused ? this.store.job(id).autoResume : false
      const localCount = job.plan?.filter((p) => p.destination === 'local').length ?? 0
      job.state = paused ? 'paused' : 'complete'
      job.message = paused
        ? 'Приостановлено. Можно продолжить.'
        : job.kind === 'search'
          ? 'Поиск завершён. Подтверди нужные версии в коллекции.'
          : localCount
            ? `Каталог Spotify перенесён. ${formatRecordsCount(localCount)} с локальными файлами нужно добавить по плану; смешанный порядок ещё не подтверждён.`
            : 'Перенос завершён. Состав и порядок каталожных записей сверены.'
      this.save(job, true)
    } catch (error) {
      job = this.store.job(id)
      const e = error instanceof Error ? error : new Error(String(error))
      job.state =
        e instanceof SpotifyError && e.ambiguousWrite && !job.playlistId ? 'needs-review' : 'paused'
      job.message = this.interrupted.has(id) ? 'Поиск остановлен. Можно продолжить.' : e.message
      if (e instanceof SpotifyError && e.retryAfter) {
        job.retryAt = Date.now() + e.retryAfter * 1000
        job.waitReason = e.waitReason ?? 'rate-limit'
        if (job.searchProvider !== 'browser')
          this.store.setValue(
            'spotify-api-retryAt',
            Math.max(job.retryAt, this.store.value('spotify-api-retryAt', 0)),
          )
        else
          this.store.setValue(
            'spotify-browser-retryAt',
            Math.max(job.retryAt, this.store.value('spotify-browser-retryAt', 0)),
          )
      } else job.autoResume = false
      this.save(job, true)
    } finally {
      this.active = null
      this.activeCollectionId = null
      this.interrupted.delete(id)
      this.changed()
      this.wake()
    }
  }
  shutdown(): void {
    this.stopping = true
    clearTimeout(this.timer)
    if (this.active) this.pause(this.active, false)
  }
  pauseActive(): void {
    if (this.active) this.pause(this.active)
  }
  pauseBrowserActive(): void {
    if (this.active && this.store.job(this.active).searchProvider === 'browser')
      this.pause(this.active)
  }
  async recoverPlaylist(id: string, playlistId: string): Promise<void> {
    if (this.active) throw new Error('Сначала останови текущее задание.')
    const job = this.store.job(id)
    if (job.state !== 'needs-review' || job.kind !== 'transfer' || !job.plan)
      throw new Error('Это задание не требует восстановления плейлиста.')
    const metadata = await this.spotify.request<{ description: string }>(`/playlists/${playlistId}`)
    if (!metadata.description?.includes(job.id))
      throw new Error('Этот плейлист не содержит отметку данного задания VKSpot. Проверь ссылку.')
    reconcilePrefix(
      job.plan.filter((p) => p.destination === 'spotify').map((p) => p.uri!),
      await this.spotify.playlistItems(playlistId),
    )
    job.playlistId = playlistId
    job.state = 'paused'
    job.message = 'Существующий плейлист найден и сверён. Можно продолжить.'
    this.save(job, true)
  }
  async reconcileMixed(id: string): Promise<void> {
    if (this.active) throw new Error('Сначала останови текущее задание.')
    const job = this.store.job(id)
    if (job.kind !== 'transfer' || !job.playlistId || !job.plan || job.state !== 'complete')
      throw new Error('Сначала заверши каталожный этап переноса.')
    this.active = id
    this.activeCollectionId = job.collectionId
    this.interrupted.delete(id)
    try {
      let actual = await this.spotify.playlistItems(job.playlistId)
      const desired = mixedOrder(job.plan, actual)
      for (let position = 0; position < desired.length; position++) {
        if (this.interrupted.has(id)) {
          job.message = 'Сверка остановлена. Повторный запуск проверит текущий порядок.'
          this.save(job, true)
          return
        }
        if (actual[position] === desired[position]) continue
        const from = actual.indexOf(desired[position], position + 1)
        if (from < 0) throw new Error('Состав плейлиста изменился во время сверки.')
        await this.spotify.request(`/playlists/${job.playlistId}/items`, 'PUT', {
          range_start: from,
          insert_before: position,
          range_length: 1,
        })
        const [moved] = actual.splice(from, 1)
        actual.splice(position, 0, moved)
      }
      actual = await this.spotify.playlistItems(job.playlistId)
      if (actual.length !== desired.length || actual.some((uri, i) => uri !== desired[i]))
        throw new Error('Порядок изменился во время проверки. Повтори сверку.')
      job.message = 'Смешанный плейлист сверён: каталожные и локальные записи идут в порядке плана.'
      this.save(job, true)
    } catch (error) {
      if (error instanceof SpotifyError && error.retryAfter) {
        const retryAt = Date.now() + error.retryAfter * 1000
        this.store.setValue(
          'spotify-api-retryAt',
          Math.max(retryAt, this.store.value('spotify-api-retryAt', 0)),
        )
        job.message = error.message
        this.save(job, true)
      }
      throw error
    } finally {
      this.active = null
      this.activeCollectionId = null
      this.interrupted.delete(id)
      this.changed()
      this.wake()
    }
  }
}
