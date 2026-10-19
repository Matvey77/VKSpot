import { WebContentsView, type BrowserWindow } from 'electron'
import { spotifyTrackSchema, type SpotifyTrack, type SpotifyBrowserState } from '../shared/model'
import { SpotifyError } from './spotify'

// Runs in an isolated world. Reads only rendered search rows, never page state,
// credentials, cookies or Spotify's private network endpoints.
export function readSpotifySearch(query: string) {
  const text = document.body?.innerText ?? ''
  if (location.hostname !== 'open.spotify.com') return { kind: 'attention', tracks: [] }
  const path = location.pathname.split('/').filter(Boolean)
  const pathQuery = decodeURIComponent(path[1] ?? '')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cleanQuery = query
    .replace(/[\r\n\t\\]+/g, ' ')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    path[0] !== 'search' ||
    (pathQuery !== query &&
      pathQuery !== cleanQuery &&
      pathQuery.toLowerCase() !== cleanQuery.toLowerCase())
  )
    return { kind: 'loading', tracks: [] }
  const rows = [...document.querySelectorAll('[data-testid="tracklist-row"]')]
  if (
    [...document.querySelectorAll('iframe[src*="captcha"], [data-testid="challenge"]')].some(
      (element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.width > 150 &&
          bounds.height > 100 &&
          getComputedStyle(element).visibility !== 'hidden'
        )
      },
    ) ||
    (!rows.length &&
      /verify you are human|подтвердите, что вы человек|too many requests|слишком много запросов/i.test(
        text,
      ))
  )
    return { kind: 'attention', tracks: [] }
  if (!rows.length && /something went wrong|что-то пошло не так|не удалось загрузить/i.test(text))
    return { kind: 'error', tracks: [] }
  const tracks = rows.flatMap((row) => {
    const link = row.querySelector<HTMLAnchorElement>('a[href*="/track/"]')
    const id = link?.pathname.match(/^\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})$/)?.[1]
    const title = link?.textContent?.trim()
    const artists = [...row.querySelectorAll<HTMLAnchorElement>('a[href*="/artist/"]')]
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean)
    const times = [...row.querySelectorAll('div, span')]
      .map((el) => el.textContent?.trim() ?? '')
      .filter((value) => /^(?:\d{1,2}:)?\d{1,3}:[0-5]\d$/.test(value))
    const time = times.at(-1)?.split(':').map(Number)
    if (!id || !title || !time || time.some(isNaN)) return []
    const duration = time.reduce((total, part) => total * 60 + part, 0)
    return [
      {
        uri: 'spotify:track:' + id,
        title,
        artists: [...new Set(artists)],
        duration,
        url: 'https://open.spotify.com/track/' + id,
        album: row.querySelector('a[href*="/album/"]')?.textContent?.trim() ?? '',
      },
    ]
  })
  const unique = [...new Map(tracks.map((track) => [track.uri, track])).values()].slice(0, 10)
  if (rows.length && tracks.length !== rows.length) return { kind: 'incomplete', tracks: [] }
  if (unique.length) return { kind: 'ready', tracks: unique }
  // Only an explicit completed no-results screen can establish an empty search.
  if (
    /(?:no\s+(?:results|tracks)\s+(?:found|for)|couldn't\s+find|spelled\s+correctly|ничего\s+не\s+(?:найдено|нашли)|(?:треки|треков|результаты|результатов)\s+не\s+найден[ыо]|не\s+удалось\s+найти|нет\s+ли\s+опечаток|перефразируй(?:те)?|keine\s+(?:ergebnisse|titel)|richtig\s+geschrieben|no\s+se\s+(?:han\s+)?encontraron|aucun\s+(?:résultat|titre))/i.test(
      text,
    )
  )
    return { kind: 'empty', tracks: [] }
  return { kind: 'loading', tracks: [] }
}

export class SpotifyBrowser {
  private view: WebContentsView | undefined
  private visible = false
  private owner: string | undefined
  private busy = false
  private stopped = false
  private retryAt = 0
  private loading: Promise<void> | undefined
  private loadFailed = false
  private status: SpotifyBrowserState = {
    state: 'idle',
    message: '',
  }
  constructor(
    private host: () => BrowserWindow,
    private changed: () => void,
  ) {}
  snapshot(): SpotifyBrowserState {
    return this.status
  }
  private update(
    state: SpotifyBrowserState['state'],
    message = '',
    reason?: SpotifyBrowserState['reason'],
    page?: SpotifyBrowserState['page'],
  ) {
    this.status = {
      state,
      message,
      ...(reason !== undefined ? { reason } : {}),
      ...(page !== undefined ? { page } : this.status.page ? { page: this.status.page } : {}),
    }
    this.changed()
  }
  private ensure(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:vkspot-spotify-browser',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.view = view
    // Spotify selects its mobile site for Electron's product user agent. Use
    // the same Chromium desktop identity as the actual Windows web runtime.
    view.webContents.setUserAgent(
      view.webContents.getUserAgent().replace(/\s(?:Electron|VKSpot|vkspot)\/\S+/g, ''),
    )
    const allowed = (address: string) => {
      try {
        const url = new URL(address)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
        return (
          /(?:^|\.)(?:spotify\.com|scdn\.co|spotifycdn\.com|google\.com|recaptcha\.net|gstatic\.com)$/i.test(
            url.hostname,
          ) || url.href === 'about:blank'
        )
      } catch {
        return false
      }
    }
    view.webContents.on('will-navigate', (event, address) => {
      if (!allowed(address)) event.preventDefault()
    })
    view.webContents.on('will-redirect', (event, address) => {
      if (!allowed(address)) event.preventDefault()
    })
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) void view.webContents.loadURL(url).catch(() => {})
      return { action: 'deny' }
    })
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    view.webContents.session.on('will-download', (event) => event.preventDefault())
    view.webContents.session.webRequest.onHeadersReceived(
      { urls: ['https://open.spotify.com/*'] },
      (details, callback) => {
        if (details.resourceType === 'mainFrame' && details.statusCode === 429) {
          const entry = Object.entries(details.responseHeaders ?? {}).find(
            ([key]) => key.toLowerCase() === 'retry-after',
          )?.[1]?.[0]
          const seconds = entry ? Number(entry) : 60
          const delay = Number.isFinite(seconds)
            ? Math.max(1, seconds) * 1000
            : Math.max(1000, Date.parse(entry!) - Date.now())
          this.retryAt = Date.now() + (Number.isFinite(delay) ? delay : 60000)
        }
        callback({})
      },
    )
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
          event.preventDefault()
          void this.reload()
        }
      }
    })
    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _url, isMainFrame) => {
        if (isMainFrame && errorCode !== -3) {
          this.loadFailed = true
          const message = `Не удалось загрузить страницу Spotify (${errorDescription || errorCode}). Проверьте подключение или прокси.`
          this.update('attention', message, 'load', {
            state: 'error',
            message,
          })
        }
      },
    )
    const markPageReady = () => {
      const url = view.webContents.getURL()
      if (url && !url.startsWith('chrome-error:') && !url.startsWith('about:blank')) {
        this.loadFailed = false
        if (this.visible && this.status.page?.state === 'loading') {
          this.update(this.status.state, this.status.message, this.status.reason, {
            state: 'ready',
            message: '',
          })
        }
      }
    }
    view.webContents.on('dom-ready', markPageReady)
    view.webContents.on('did-finish-load', markPageReady)
    view.webContents.on('did-stop-loading', markPageReady)
    view.webContents.setAudioMuted(true)
    this.host().contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 1200, height: 900 })
    view.setVisible(false)
    return view
  }
  async show(bounds: Electron.Rectangle | null, owner = 'legacy'): Promise<void> {
    if (!bounds) {
      if (this.owner !== owner) return
      this.visible = false
      this.owner = undefined
      this.view?.setVisible(false)
      this.view?.webContents.setAudioMuted(true)
      return
    }
    const view = this.ensure()
    this.owner = owner
    this.visible = true
    view.setBounds(bounds)
    view.setVisible(true)
    view.webContents.setAudioMuted(false)
    const currentURL = view.webContents.getURL()
    let isSpotify = false
    try {
      if (currentURL && currentURL.startsWith('https://')) {
        const host = new URL(currentURL).hostname
        isSpotify = /(?:^|\.)spotify\.com$/i.test(host)
      }
    } catch {
      isSpotify = false
    }
    if (isSpotify && !this.loadFailed && !view.webContents.isLoading()) {
      if (this.status.page?.state !== 'ready') {
        this.update(this.status.state, this.status.message, this.status.reason, {
          state: 'ready',
          message: '',
        })
      }
      return
    }
    if ((!isSpotify || this.loadFailed || this.status.reason === 'load') && !this.loading) {
      this.loadFailed = false
      const address = 'https://open.spotify.com/search'
      this.update(this.status.state, this.status.message, this.status.reason, {
        state: 'loading',
        message: 'Загружаем страницу Spotify…',
      })
      const load = view.webContents.loadURL(address)
      let timer: ReturnType<typeof setTimeout> | undefined
      this.loading = Promise.race([
        load,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (!view.webContents.isDestroyed() && view.webContents.getURL() === address)
              view.webContents.stop()
            reject(
              new Error('Страница Spotify не загрузилась за 25 секунд. Проверь сеть или прокси.'),
            )
          }, 25000)
        }),
      ])
        .then(() => {
          this.loadFailed = false
          this.update(this.status.state, this.status.message, this.status.reason, {
            state: 'ready',
            message: '',
          })
        })
        .catch((error: unknown) => {
          if (view.webContents.isDestroyed()) return
          this.loadFailed = true
          const message = error instanceof Error ? error.message : 'Не удалось открыть Spotify.'
          this.update('attention', message, 'load', {
            state: 'error',
            message,
          })
        })
        .finally(() => {
          clearTimeout(timer)
          this.loading = undefined
        })
    }
  }
  async reload(owner?: string): Promise<void> {
    if (owner && this.owner && this.owner !== owner) return
    const view = this.ensure()
    this.loadFailed = false
    this.update(this.status.state, this.status.message, this.status.reason, {
      state: 'loading',
      message: 'Обновляем страницу Spotify…',
    })
    const address = 'https://open.spotify.com/search'
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        view.webContents.loadURL(address),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (!view.webContents.isDestroyed()) view.webContents.stop()
            reject(
              new Error('Страница Spotify не загрузилась за 25 секунд. Проверь сеть или прокси.'),
            )
          }, 25000)
        }),
      ])
      this.loadFailed = false
      this.update(this.status.state, this.status.message, this.status.reason, {
        state: 'ready',
        message: '',
      })
    } catch (error: unknown) {
      if (view.webContents.isDestroyed()) return
      this.loadFailed = true
      const message =
        error instanceof Error ? error.message : 'Не удалось обновить страницу Spotify.'
      this.update('attention', message, 'load', {
        state: 'error',
        message,
      })
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  async search(query: string): Promise<SpotifyTrack[]> {
    if (this.busy) throw new Error('Поиск Spotify уже выполняется.')
    this.busy = true
    this.stopped = false
    this.update('searching', '', undefined)
    let lastKind: string | undefined
    try {
      const view = this.ensure()
      if (this.visible)
        throw new Error(
          'Закрой страницу Spotify кнопкой «Вернуться к коллекции», затем продолжи поиск.',
        )
      // Full navigation prevents a previous query's rows from being accepted.
      const cleanQuery =
        query
          .replace(/[\r\n\t\\]+/g, ' ')
          .replace(/%/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || query
      let loadError: Error | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        if (this.stopped || view.webContents.isDestroyed())
          throw new Error('Поиск остановлен. Прогресс сохранён.')
        try {
          const load = view.webContents.loadURL(
            'https://open.spotify.com/search/' + encodeURIComponent(cleanQuery) + '/tracks',
          )
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              load,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new Error(
                        'Страница Spotify не загрузилась за 30 секунд. Проверь сеть или прокси в подключениях.',
                      ),
                    ),
                  30000,
                )
              }),
            ])
            loadError = undefined
            break
          } finally {
            clearTimeout(timer)
          }
        } catch (err) {
          loadError = err instanceof Error ? err : new Error(String(err))
          if (attempt === 0 && !this.stopped && !view.webContents.isDestroyed()) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            continue
          }
        }
      }
      if (loadError) {
        const raw = loadError.message || ''
        const friendly = /ERR_CONNECTION_RESET|-101/i.test(raw)
          ? 'Сбой соединения со Spotify (ERR_CONNECTION_RESET). Проверьте интернет или прокси в подключениях.'
          : /ERR_INTERNET_DISCONNECTED|-106/i.test(raw)
            ? 'Нет подключения к интернету. Проверьте соединение.'
            : /ERR_PROXY|-130|-131|-111/i.test(raw)
              ? 'Ошибка подключения к прокси-серверу. Проверьте адрес прокси в подключениях.'
              : raw
        throw new Error(friendly)
      }
      const until = Date.now() + 30000
      let previous = '',
        stableAt = 0
      while (Date.now() < until) {
        if (this.stopped || view.webContents.isDestroyed())
          throw new Error('Поиск остановлен. Прогресс сохранён.')
        if (this.retryAt > Date.now())
          throw new SpotifyError(
            'Страница Spotify попросила подождать. Поиск и результаты сохранены.',
            Math.ceil((this.retryAt - Date.now()) / 1000),
            false,
            'rate-limit',
          )
        const result = (await view.webContents.executeJavaScriptInIsolatedWorld(1002, [
          {
            code: `(${readSpotifySearch.toString()})(${JSON.stringify(cleanQuery)})`,
          },
        ])) as ReturnType<typeof readSpotifySearch>
        lastKind = result.kind
        if (result.kind === 'attention')
          throw new Error(
            'Spotify требует вход или проверку. Открой страницу Spotify здесь, заверши проверку и продолжи поиск.',
          )
        if (result.kind === 'error')
          throw new Error(
            'Spotify не загрузил результаты. Открой страницу Spotify и проверь подключение.',
          )
        if (result.kind === 'ready' || result.kind === 'empty') {
          const signature = JSON.stringify(result)
          if (signature !== previous) {
            previous = signature
            stableAt = Date.now()
          }
          if (Date.now() - stableAt >= 1200) {
            this.update('idle', '', undefined)
            return spotifyTrackSchema.array().max(10).parse(result.tracks)
          }
        } else {
          previous = ''
          stableAt = 0
        }
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      throw new Error(
        'Не удалось прочитать результаты Spotify. Открой страницу Spotify и проверь её; трек не помечен как ненайденный.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось открыть Spotify.'
      const needsHelp = !this.stopped && !(error instanceof SpotifyError && error.retryAfter > 0)
      const reason: SpotifyBrowserState['reason'] =
        lastKind === 'attention' ? 'verification' : 'load'
      if (needsHelp) this.loadFailed = true
      this.update(
        needsHelp ? 'attention' : 'idle',
        needsHelp ? message : '',
        needsHelp ? reason : undefined,
        needsHelp ? { state: 'error', message } : undefined,
      )
      if (error instanceof SpotifyError) throw error
      throw new SpotifyError(message)
    } finally {
      this.busy = false
    }
  }
  stop() {
    this.stopped = true
    this.view?.webContents.stop()
  }
  close() {
    this.stop()
    this.view?.webContents.close()
    this.view = undefined
  }
}
