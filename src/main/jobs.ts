import { makePlan, reconcilePrefix, mixedOrder } from '../core/collection'
import { searchText, reviewGroup } from '../core/matching'
import type { Job } from '../shared/model'
import type { Store } from './store'
import { Spotify, SpotifyError } from './spotify'
import { autoSearch, jobMessage, waitingJob } from '../shared/job-status'
import type { SpotifyBrowser } from './spotify-browser'

export class Jobs {
  private active: string | null = null
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
  wake(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.stopping || this.active || !this.store.settings().autoResumeSearch) return
    const jobs = this.store.jobs()
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
            ? Math.max(job.retryAt ?? now, this.store.value('spotify-browser-retryAt', 0))
            : Math.max(
                job.retryAt ?? now,
                waitingJob(jobs, now)?.retryAt ?? now,
                this.store.value('spotify-api-retryAt', 0),
              ),
      }))
      .sort((a, b) => a.deadline - b.deadline)[0]
    if (!candidate) return
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        if (this.stopping) return
        try {
          this.resume(candidate.job.id)
        } catch {
          this.wake()
        }
      },
      Math.min(2147483647, Math.max(0, candidate.deadline - now)),
    )
    this.timer.unref?.()
  }
  private save(job: Job): void {
    // Preserve a manual pause if a request finishes with an older runner snapshot.
    if (
      this.active === job.id &&
      this.interrupted.has(job.id) &&
      this.store.job(job.id).autoResume === false
    )
      job.autoResume = false
    this.store.putJob(job)
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
      this.save(job)
      return
    }
    this.interrupted.add(id)
    if (this.active === id && job.searchProvider === 'browser') this.browser?.stop()
    if (job.state !== 'complete')
      this.save({
        ...job,
        state: this.active === id ? 'pausing' : 'paused',
        message: 'Приостановлено. Текущий запрос завершится и будет сохранён.',
      })
  }
  search(collectionId: string, rowIds: string[], background = false): string {
    if (this.active) throw new Error('Другое задание уже работает. Приостановите его.')
    const provider = this.browser ? this.store.settings().searchProvider : 'api'
    if (provider === 'api') {
      if (!this.spotify.connected()) throw new Error('Подключите Spotify для поиска через API.')
      this.checkCooldown()
    } else this.checkBrowserCooldown()
    const collection = this.store.get(collectionId),
      valid = new Set(collection.rows.map((r) => r.id))
    if (!rowIds.length || rowIds.some((id) => !valid.has(id)))
      throw new Error('Выберите записи из этой коллекции.')
    const job = this.store.newJob(collectionId, 'search', [...new Set(rowIds)])
    job.backgroundSearch = background
    job.autoResume = background
    job.searchProvider = provider
    this.store.putJob(job)
    void this.run(job.id).catch(() => undefined)
    return job.id
  }
  transfer(collectionId: string): string {
    if (this.active) throw new Error('Другое задание уже работает. Приостановите его.')
    if (!this.spotify.connected()) throw new Error('Для переноса через API подключите Spotify.')
    this.checkCooldown()
    const plan = makePlan(this.store.get(collectionId))
    if (!plan.length) throw new Error('Нет записей для переноса.')
    const remote = plan.filter((p) => p.destination === 'spotify')
    if (!remote.length)
      throw new Error('В плане только локальные записи. Используйте подготовку локальных файлов.')
    if (
      this.store
        .jobs()
        .some(
          (j) => j.collectionId === collectionId && j.kind === 'transfer' && j.state !== 'complete',
        )
    )
      throw new Error('У этой коллекции уже есть незавершённый перенос. Продолжите его в заданиях.')
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
    if (this.active)
      throw new Error('Другое задание уже работает. Приостановите его перед запуском.')
    const job = this.store.job(id)
    if (job.state === 'complete') return job
    if (job.searchProvider !== 'browser') this.checkCooldown()
    else this.checkBrowserCooldown()
    if (job.state === 'needs-review')
      throw new Error(
        'Создание плейлиста могло выполниться. Проверьте Spotify; автоматический повтор отключён, чтобы не создать второй плейлист.',
      )
    return job
  }
  private checkCooldown(): void {
    const now = Date.now()
    const waiting = waitingJob(this.store.jobs(), now)
    if (waiting) throw new Error('Spotify запросил паузу. ' + jobMessage(waiting, now))
    if (this.store.value('spotify-api-retryAt', 0) > now)
      throw new Error(
        'Квота Spotify API пока не восстановилась. Поиск через страницу Spotify доступен отдельно; перенос нужно повторить позже.',
      )
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
    this.store.putJob(job)
    this.resume(id)
  }
  resume(id: string): void {
    const job = this.runnable(id)
    if (job.state === 'complete') return
    if (job.searchProvider !== 'browser' && !this.spotify.connected())
      throw new Error('Подключите Spotify для продолжения задания.')
    // Validate synchronously so IPC reports refusals, then release the UI while
    // the runner persists progress and any subsequent network error.
    void this.run(id).catch(() => undefined)
  }
  async run(id: string): Promise<void> {
    let job = this.runnable(id)
    if (job.state === 'complete') return
    this.active = id
    this.interrupted.delete(id)
    delete job.retryAt
    delete job.waitReason
    job.autoResume = job.kind === 'search' && job.backgroundSearch === true
    job.state = 'running'
    job.message = 'Выполняется…'
    this.save(job)
    try {
      if (job.kind === 'search') {
        while (job.cursor < job.rowIds.length && !this.interrupted.has(id)) {
          const row = this.store.row(job.collectionId, job.rowIds[job.cursor])
          let requested = false
          if (!row.working.excluded && (!job.backgroundSearch || reviewGroup(row) === 'pending')) {
            const query = searchText(row.working)
            if (query.trim()) {
              const cacheKey =
                (job.searchProvider === 'browser' ? 'spotify-browser-v1:' : 'spotify-search-v1:') +
                query
              let results = this.store.cached<Awaited<ReturnType<Spotify['search']>>>(cacheKey)
              if (!results) {
                requested = true
                results =
                  job.searchProvider === 'browser'
                    ? await this.browser!.search(query)
                    : await this.spotify.search(query)
                this.store.cache(cacheKey, results)
              }
              const current = this.store.row(job.collectionId, row.id)
              if (searchText(current.working) === query)
                this.store.patch(
                  job.collectionId,
                  [row.id],
                  { candidates: results, searchedQuery: query },
                  false,
                )
            } else this.store.patch(job.collectionId, [row.id], { searchedQuery: query }, false)
          }
          job.cursor++
          job.message = `Кандидаты: ${job.cursor} из ${job.total}. Версии подтверждаются вручную.`
          this.save(job)
          if (requested && job.cursor < job.total) {
            const until = Date.now() + this.store.settings().searchDelayMs
            while (Date.now() < until && !this.interrupted.has(id))
              await new Promise((resolve) => setTimeout(resolve, Math.min(250, until - Date.now())))
          } else if (job.cursor % 25 === 0)
            await new Promise<void>((resolve) => setImmediate(resolve))
        }
      } else {
        const expected = job.plan!.filter((p) => p.destination === 'spotify').map((p) => p.uri!)
        if (!job.playlistId) {
          const p = await this.spotify.request<{ id: string }>('/me/playlists', 'POST', {
            name: this.store.settings().playlistName,
            public: false,
            description: `VKSpot transfer ${job.id}`,
          })
          job.playlistId = p.id
          this.save(job)
        }
        const actual = await this.spotify.playlistItems(job.playlistId)
        job.cursor = reconcilePrefix(expected, actual)
        this.save(job)
        while (job.cursor < expected.length && !this.interrupted.has(id)) {
          const batch = expected.slice(job.cursor, job.cursor + 100)
          await this.spotify.request(`/playlists/${job.playlistId}/items`, 'POST', { uris: batch })
          job.cursor = reconcilePrefix(expected, await this.spotify.playlistItems(job.playlistId))
          job.message = `Сверено ${job.cursor} из ${job.total}.`
          this.save(job)
        }
      }
      const paused = this.interrupted.has(id)
      job.autoResume = paused ? this.store.job(id).autoResume : false
      const localCount = job.plan?.filter((p) => p.destination === 'local').length ?? 0
      job.state = paused ? 'paused' : 'complete'
      job.message = paused
        ? 'Приостановлено. Можно продолжить.'
        : job.kind === 'search'
          ? 'Поиск завершён. Подтвердите нужные версии в коллекции.'
          : localCount
            ? `Каталог Spotify перенесён. ${localCount} локальных записей нужно добавить по плану; смешанный порядок ещё не подтверждён.`
            : 'Перенос завершён. Состав и порядок каталожных записей сверены.'
      this.save(job)
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
      this.save(job)
    } finally {
      this.active = null
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
    if (this.active) throw new Error('Сначала остановите текущее задание.')
    const job = this.store.job(id)
    if (job.state !== 'needs-review' || job.kind !== 'transfer' || !job.plan)
      throw new Error('Это задание не требует восстановления плейлиста.')
    const metadata = await this.spotify.request<{ description: string }>(`/playlists/${playlistId}`)
    if (!metadata.description?.includes(job.id))
      throw new Error('Этот плейлист не содержит отметку данного задания VKSpot. Проверьте ссылку.')
    reconcilePrefix(
      job.plan.filter((p) => p.destination === 'spotify').map((p) => p.uri!),
      await this.spotify.playlistItems(playlistId),
    )
    job.playlistId = playlistId
    job.state = 'paused'
    job.message = 'Существующий плейлист найден и сверён. Можно продолжить.'
    this.save(job)
  }
  async reconcileMixed(id: string): Promise<void> {
    if (this.active) throw new Error('Сначала остановите текущее задание.')
    const job = this.store.job(id)
    if (job.kind !== 'transfer' || !job.playlistId || !job.plan || job.state !== 'complete')
      throw new Error('Сначала завершите каталожный этап переноса.')
    this.active = id
    try {
      let actual = await this.spotify.playlistItems(job.playlistId)
      const desired = mixedOrder(job.plan, actual)
      for (let position = 0; position < desired.length; position++) {
        if (this.interrupted.has(id)) {
          job.message = 'Сверка остановлена. Повторный запуск проверит текущий порядок.'
          this.save(job)
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
        throw new Error('Порядок изменился во время проверки. Повторите сверку.')
      job.message = 'Смешанный плейлист сверён: каталожные и локальные записи идут в порядке плана.'
      this.save(job)
    } finally {
      this.active = null
      this.interrupted.delete(id)
    }
  }
}
