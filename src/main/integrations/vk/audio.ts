import { BrowserWindow } from 'electron'
import { humanizeNetworkError } from '../../../shared/ru'
import {
  isVKSignInPage,
  playVKLibraryTrack,
  readVKLibraryLink,
  stopVKAudioPage,
} from './audio-page'
import { ensureVKSessionPolicy } from './vk-session-policy'

export type VKAudioTrack = {
  id?: string
  artist: string
  title: string
  duration?: number | null
  position?: number
}
export type VKAudioResult = { playing: boolean; error?: string }

export function vkLibraryURL(address: string | null | undefined): string | null {
  try {
    const url = new URL(address ?? '')
    if (
      url.protocol !== 'https:' ||
      !['vk.com', 'vk.ru'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null
    if (!/^\/audios-?\d+\/?$/.test(url.pathname)) return null
    return `${url.origin}${url.pathname}?section=all`
  } catch {
    return null
  }
}

export class VKAudioPlayer {
  private view: BrowserWindow | null = null
  private playing = false
  private currentKey: string | null = null
  private revision = 0
  private pending: Promise<VKAudioResult> = Promise.resolve({ playing: false })
  private lastTrack: VKAudioTrack | undefined
  private startingRevision: number | undefined
  private cancellation: AbortController | undefined
  private readonly viewAbort = new WeakMap<BrowserWindow, AbortController>()
  private readonly world = 1003

  constructor(
    private host: () => BrowserWindow,
    private personalLibrary: () => string | null = () => null,
    private progress: (message: string) => void = () => {},
  ) {}

  private ensure(): BrowserWindow {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const main = this.host()
    const view = new BrowserWindow({
      title: 'VKSpot — аудио VK',
      show: false,
      useContentSize: true,
      width: 1280,
      height: 800,
      skipTaskbar: true,
      focusable: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        partition: 'persist:vkspot-vk',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.view = view
    view.webContents.setUserAgent(
      view.webContents.getUserAgent().replace(/\s(?:Electron|VKSpot|vkspot)\/\S+/g, ''),
    )
    view.webContents.setAudioMuted(false)
    const allowed = (address: string) => {
      try {
        const url = new URL(address)
        return (
          url.href === 'about:blank' ||
          (url.protocol === 'https:' &&
            /(?:^|\.)(?:vk\.com|vk\.ru|userapi\.com|vkuseraudio\.net|mycdn\.me|mail\.ru|vk\.me|v-k\.me|vkuserlive\.com|vkcache\.com|vk-cdn\.net|vkuser\.net)$/i.test(
              url.hostname,
            ))
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
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    ensureVKSessionPolicy(view.webContents.session)
    const life = new AbortController()
    this.viewAbort.set(view, life)
    const resetViewState = () => {
      if (this.view !== view) return
      ++this.revision
      this.cancellation?.abort()
      this.playing = false
      this.currentKey = null
      this.view = null
    }
    const teardown = () => {
      life.abort()
      main.off('closed', closeWithHost)
      resetViewState()
    }
    const closeWithHost = () => this.close()
    main.once('closed', closeWithHost)
    view.once('closed', teardown)
    view.webContents.on('destroyed', teardown)
    view.webContents.on('render-process-gone', () => {
      teardown()
      if (!view.isDestroyed()) view.destroy()
    })
    return view
  }

  private destroyView(view: BrowserWindow | null): void {
    if (!view) return
    this.viewAbort.get(view)?.abort()
    if (!view.isDestroyed()) view.destroy()
  }

  private raceWithLifecycle<T>(
    view: BrowserWindow,
    start: () => Promise<T>,
    options: {
      signal?: AbortSignal
      timeoutMs?: number
      timeoutError?: string
      onAbort?: () => void
    } = {},
  ): Promise<T> {
    const life = this.viewAbort.get(view)?.signal
    if (view.webContents.isDestroyed() || life?.aborted) {
      return Promise.reject(new Error('Окно аудио VK закрыто.'))
    }
    if (options.signal?.aborted) {
      options.onAbort?.()
      return Promise.reject(new Error('Поиск оригинала VK отменён.'))
    }
    let promise: Promise<T>
    try {
      promise = start()
    } catch (error) {
      return Promise.reject(error)
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer)
        life?.removeEventListener('abort', onLifeAbort)
        options.signal?.removeEventListener('abort', onSignalAbort)
      }
      const finish = (action: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        action()
      }
      const onLifeAbort = () => finish(() => reject(new Error('Окно аудио VK закрыто.')))
      const onSignalAbort = () =>
        finish(() => {
          options.onAbort?.()
          reject(new Error('Поиск оригинала VK отменён.'))
        })
      life?.addEventListener('abort', onLifeAbort, { once: true })
      options.signal?.addEventListener('abort', onSignalAbort, { once: true })
      if (options.timeoutMs !== undefined) {
        timer = setTimeout(() => {
          finish(() => {
            options.onAbort?.()
            reject(new Error(options.timeoutError ?? 'Операция аудио VK превысила время ожидания.'))
          })
        }, options.timeoutMs)
      }
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
    })
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      signal?.addEventListener('abort', done, { once: true })
    })
  }

  private async execute<T>(
    view: BrowserWindow,
    code: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    return this.raceWithLifecycle(
      view,
      () => view.webContents.executeJavaScriptInIsolatedWorld(this.world, [{ code }]) as Promise<T>,
      options,
    )
  }

  private async load(view: BrowserWindow, address: string, signal?: AbortSignal): Promise<void> {
    return this.raceWithLifecycle(view, () => view.webContents.loadURL(address), {
      signal,
      timeoutMs: 20000,
      timeoutError: 'Страница VK не загрузилась за 20 секунд. Проверь сеть или подключение VK.',
      onAbort: () => {
        if (!view.webContents.isDestroyed()) view.webContents.stop()
      },
    })
  }

  private async stopPage(
    targetView: BrowserWindow | null = this.view,
    signal?: AbortSignal,
  ): Promise<void> {
    const view = targetView
    if (!view || view.webContents.isDestroyed()) return
    if (view.webContents.isLoadingMainFrame()) view.webContents.stop()
    try {
      await this.execute(view, `(${stopVKAudioPage.toString()})()`, {
        signal,
        timeoutMs: 3000,
      })
    } catch {
      /* Navigation or closing already stops this document. */
    }
  }

  async play(track: VKAudioTrack): Promise<VKAudioResult> {
    const key = JSON.stringify([
      track.id,
      track.artist,
      track.title,
      track.duration,
      track.position,
    ])
    if (this.currentKey === key && this.playing) return this.pause()
    const revision = ++this.revision
    this.cancellation?.abort()
    const cancellation = new AbortController()
    this.cancellation = cancellation
    this.startingRevision = revision
    this.playing = false
    this.currentKey = null
    this.lastTrack = undefined
    // Interrupt immediately, then serialize navigation so an older request cannot
    // navigate or start playing after the user selected another original.
    const stopped = this.stopPage(this.view, cancellation.signal)
    const previous = this.pending
    const task = (async (): Promise<VKAudioResult> => {
      await stopped
      await previous.catch(() => undefined)
      const cancelled = () => revision !== this.revision
      if (cancelled()) return { playing: false }
      const view = this.ensure()
      let watch: ReturnType<typeof setInterval> | undefined
      try {
        this.progress('Открываем личную медиатеку VK…')
        const personal = vkLibraryURL(this.personalLibrary())
        const current = vkLibraryURL(view.webContents.getURL())
        const hasSearchQuery = (() => {
          try {
            return new URL(view.webContents.getURL()).searchParams.has('q')
          } catch {
            return false
          }
        })()
        if (!current || hasSearchQuery || (personal && personal !== current))
          await this.load(view, personal ?? current ?? 'https://vk.com/audio', cancellation.signal)
        if (cancelled()) return { playing: false }
        // Catalogue home is not the user's list. Follow the same public tab as
        // the export adapter, including vk.com -> vk.ru redirects and hydration.
        for (let attempt = 0; attempt < 40; attempt++) {
          if (cancelled() || view.webContents.isDestroyed()) return { playing: false }
          const probe = await this.execute<
            string | { link: string | null; signIn: boolean } | null
          >(
            view,
            `(() => { const readVKLibraryLink = ${readVKLibraryLink.toString()}; const isVKSignInPage = ${isVKSignInPage.toString()}; return { link: readVKLibraryLink(), signIn: isVKSignInPage() }; })()`,
            { signal: cancellation.signal },
          )
          if (typeof probe === 'object' && probe !== null && probe.signIn === true) {
            return {
              playing: false,
              error: 'Войди в VK в разделе «Подключения» и открой «Моя музыка».',
            }
          }
          const link = vkLibraryURL(typeof probe === 'string' ? probe : (probe?.link ?? null))
          if (link && view.webContents.getURL() !== link) {
            await this.load(view, link, cancellation.signal)
            break
          }
          if (vkLibraryURL(view.webContents.getURL())) break
          await this.delay(150, cancellation.signal)
        }
        if (cancelled()) return { playing: false }
        if (!vkLibraryURL(view.webContents.getURL()))
          return {
            playing: false,
            error:
              'VK не открыл личную медиатеку. Открой «Подключения → VK» и перейди в «Мою музыку», затем повтори прослушивание.',
          }
        await this.stopPage(view, cancellation.signal)
        if (cancelled()) return { playing: false }
        view.webContents.setAudioMuted(false)
        let polling = false,
          lastProgress = ''
        watch = setInterval(async () => {
          if (polling || cancelled() || view.webContents.isDestroyed()) return
          polling = true
          try {
            const message = await this.execute<unknown>(
              view,
              'globalThis.__VKSPOT_AUDIO__?.message ?? null',
              { signal: cancellation.signal, timeoutMs: 2000 },
            )
            if (!cancelled() && typeof message === 'string' && message !== lastProgress) {
              lastProgress = message
              this.progress(message)
            }
          } catch {
            /* Cancellation or navigation can destroy this world. */
          } finally {
            polling = false
          }
        }, 350)
        const result = await this.execute<VKAudioResult>(
          view,
          `(${playVKLibraryTrack.toString()})(${JSON.stringify(track)})`,
          { signal: cancellation.signal },
        )
        if (cancelled()) return { playing: false }
        if (result.playing) {
          this.playing = true
          this.currentKey = key
          this.lastTrack = track
        } else {
          await this.stopPage(view, cancellation.signal)
          if (!view.webContents.isDestroyed()) view.webContents.setAudioMuted(true)
        }
        return result
      } catch (error) {
        if (cancelled()) return { playing: false }
        return {
          playing: false,
          error: humanizeNetworkError(
            error,
            'Не удалось воспроизвести запись из VK. Проверь сеть и повтори попытку.',
          ),
        }
      } finally {
        clearInterval(watch)
        if (this.startingRevision === revision) this.startingRevision = undefined
      }
    })()
    this.pending = task
    return task
  }

  async pause(): Promise<VKAudioResult> {
    const starting = this.startingRevision === this.revision
    ++this.revision
    this.cancellation?.abort()
    this.playing = false
    const view = this.view
    if (view && !view.webContents.isDestroyed()) view.webContents.setAudioMuted(true)
    if (starting) {
      this.view = null
      this.destroyView(view)
      return { playing: false }
    }
    await this.stopPage(view)
    return { playing: false }
  }

  async resume(): Promise<VKAudioResult> {
    return this.lastTrack ? this.play(this.lastTrack) : { playing: false }
  }

  stop(): void {
    void this.pause()
    this.currentKey = null
  }

  close(): void {
    ++this.revision
    this.cancellation?.abort()
    this.playing = false
    this.currentKey = null
    this.lastTrack = undefined
    const view = this.view
    this.view = null
    this.destroyView(view)
  }
}
