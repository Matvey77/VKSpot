import { WebContentsView, type BrowserWindow } from 'electron'
import {
  spotifyTrackSchema,
  type SpotifyTrack,
  type SpotifyBrowserState,
} from '../../../shared/model'
import { humanizeNetworkError } from '../../../shared/ru'
import { parseRetryAfterSeconds, SpotifyError } from './api'
import {
  readSpotifySearch,
  readSpotifySearchScript,
  type SpotifySearchDomResult,
} from './browser-dom'

export { readSpotifySearch, readSpotifySearchScript, type SpotifySearchDomResult }

const CHROMIUM_CODE_TO_ERR: Record<number, string> = {
  [-7]: 'ERR_TIMED_OUT',
  [-21]: 'ERR_NETWORK_CHANGED',
  [-101]: 'ERR_CONNECTION_RESET',
  [-102]: 'ERR_CONNECTION_REFUSED',
  [-105]: 'ERR_NAME_NOT_RESOLVED',
  [-106]: 'ERR_INTERNET_DISCONNECTED',
  [-111]: 'ERR_TUNNEL_CONNECTION_FAILED',
  [-118]: 'ERR_CONNECTION_TIMED_OUT',
  [-130]: 'ERR_PROXY_CONNECTION_FAILED',
  [-131]: 'ERR_PROXY_AUTH_REQUESTED',
  [-137]: 'ERR_NAME_NOT_RESOLVED',
}

function translateSpotifyLoadError(error: unknown, fallback: string): string {
  const direct = humanizeNetworkError(error, '')
  if (direct) return direct
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const codeMatch = raw.match(/-\d{1,3}/)
  if (codeMatch) {
    const mapped = CHROMIUM_CODE_TO_ERR[Number(codeMatch[0])]
    if (mapped) return humanizeNetworkError(mapped, fallback)
  }
  return fallback
}

export function isAllowedSpotifyBrowserUrl(address: string): boolean {
  if (address === 'about:blank') return true
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase()
    if (hostname === 'www.google.com') return url.pathname.startsWith('/recaptcha/')
    return /(?:^|\.)(?:spotify\.com|scdn\.co|spotifycdn\.com|recaptcha\.net|gstatic\.com)$/i.test(
      hostname,
    )
  } catch {
    return false
  }
}

export class SpotifyBrowser {
  private view: WebContentsView | null = null
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
    // the Chromium desktop identity of the current platform.
    view.webContents.setUserAgent(
      view.webContents.getUserAgent().replace(/\s(?:Electron|VKSpot|vkspot)\/\S+/g, ''),
    )
    view.webContents.on('will-navigate', (event, address) => {
      if (!isAllowedSpotifyBrowserUrl(address)) event.preventDefault()
    })
    view.webContents.on('will-redirect', (event, address) => {
      if (!isAllowedSpotifyBrowserUrl(address)) event.preventDefault()
    })
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedSpotifyBrowserUrl(url)) void view.webContents.loadURL(url).catch(() => {})
      return { action: 'deny' }
    })
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    view.webContents.session.on('will-download', (event) => event.preventDefault())
    view.webContents.session.webRequest.onHeadersReceived(
      { urls: ['https://open.spotify.com/*', 'https://api-partner.spotify.com/*'] },
      (details, callback) => {
        const isMain = details.resourceType === 'mainFrame'
        const isPartnerApi =
          Boolean(details.url?.startsWith('https://api-partner.spotify.com/')) &&
          (['xhr', 'fetch'] as readonly string[]).includes(details.resourceType)
        if (details.statusCode === 429 && (isMain || isPartnerApi)) {
          const entry = Object.entries(details.responseHeaders ?? {}).find(
            ([key]) => key.toLowerCase() === 'retry-after',
          )?.[1]?.[0]
          const delay = parseRetryAfterSeconds(entry ?? null) * 1000
          this.retryAt = Math.max(this.retryAt, Date.now() + delay)
        }
        callback({})
      },
    )
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
          event.preventDefault()
          void this.reload().catch(() => {})
        }
      }
    })
    view.webContents.on('render-process-gone', () => {
      if (this.view !== view) return
      try {
        const host = this.host()
        if (!host.isDestroyed()) host.contentView.removeChildView(view)
      } catch {
        /* Host window may already be closing. */
      }
      if (!view.webContents.isDestroyed()) view.webContents.close()
      this.view = null
      this.busy = false
      this.visible = false
      this.owner = undefined
      this.loading = undefined
      this.loadFailed = false
      this.update('idle', '', undefined, {
        state: 'error',
        message: 'Страница Spotify завершилась аварийно. Открой или обнови её снова.',
      })
    })
    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _url, isMainFrame) => {
        if (isMainFrame && errorCode !== -3) {
          this.loadFailed = true
          const raw = errorDescription || CHROMIUM_CODE_TO_ERR[errorCode] || String(errorCode)
          const message = translateSpotifyLoadError(
            raw,
            'Не удалось загрузить страницу Spotify. Проверь подключение или прокси.',
          )
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
  async show(bounds: Electron.Rectangle | null, owner?: string): Promise<void> {
    if (!bounds) {
      if (owner !== undefined && this.owner !== undefined && this.owner !== owner) return
      this.visible = false
      this.owner = undefined
      if (this.view && !this.view.webContents.isDestroyed()) {
        this.view.setVisible(false)
        this.view.webContents.setAudioMuted(true)
      }
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
          const message = translateSpotifyLoadError(
            error,
            'Не удалось открыть Spotify. Проверь подключение или прокси.',
          )
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
    if (this.busy) {
      throw new Error(
        'Поиск Spotify сейчас выполняется. Дождись его остановки перед обновлением страницы.',
      )
    }
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
      const message = translateSpotifyLoadError(
        error,
        'Не удалось обновить страницу Spotify. Проверь подключение или прокси.',
      )
      this.update('attention', message, 'load', {
        state: 'error',
        message,
      })
      throw new Error(message, { cause: error })
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
      const ensureNotRateLimited = () => {
        if (this.retryAt > Date.now())
          throw new SpotifyError(
            'Страница Spotify попросила подождать. Поиск и результаты сохранены.',
            Math.ceil((this.retryAt - Date.now()) / 1000),
            false,
            'rate-limit',
          )
      }
      ensureNotRateLimited()
      // Full navigation prevents a previous query's rows from being accepted.
      const cleanQuery =
        query
          .replace(/[\r\n\t\\]+/g, ' ')
          .replace(/%/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || query
      let loadError: Error | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        if (this.stopped || view.webContents.isDestroyed() || this.view !== view)
          throw new Error('Поиск остановлен. Прогресс сохранён.')
        ensureNotRateLimited()
        try {
          const load = view.webContents.loadURL(
            'https://open.spotify.com/search/' + encodeURIComponent(cleanQuery) + '/tracks',
          )
          load.catch(() => {})
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              load,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  if (!view.webContents.isDestroyed()) view.webContents.stop()
                  reject(
                    new Error(
                      'Страница Spotify не загрузилась за 30 секунд. Проверь сеть или прокси в подключениях.',
                    ),
                  )
                }, 30000)
              }),
            ])
            loadError = undefined
            break
          } finally {
            clearTimeout(timer)
          }
        } catch (err) {
          loadError = err instanceof Error ? err : new Error(String(err))
          if (
            attempt === 0 &&
            !this.stopped &&
            !view.webContents.isDestroyed() &&
            this.view === view &&
            this.retryAt <= Date.now()
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            continue
          }
        }
      }
      if (loadError) {
        throw new Error(
          translateSpotifyLoadError(
            loadError,
            'Не удалось загрузить страницу Spotify. Проверь интернет или прокси в разделе «Подключения».',
          ),
        )
      }
      const until = Date.now() + 30000
      let previous = '',
        stableAt = 0
      while (Date.now() < until) {
        if (this.stopped || view.webContents.isDestroyed() || this.view !== view)
          throw new Error('Поиск остановлен. Прогресс сохранён.')
        ensureNotRateLimited()
        const result = (await view.webContents.executeJavaScriptInIsolatedWorld(1002, [
          {
            code: readSpotifySearchScript(cleanQuery),
          },
        ])) as SpotifySearchDomResult
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
      if (!view.webContents.isDestroyed()) view.webContents.stop()
      throw new Error(
        'Не удалось прочитать результаты Spotify. Открой страницу Spotify и проверь её; трек не помечен как ненайденный.',
      )
    } catch (error) {
      const message = translateSpotifyLoadError(error, 'Не удалось открыть Spotify.')
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
    this.visible = false
    this.owner = undefined
    this.loading = undefined
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
  }
}
