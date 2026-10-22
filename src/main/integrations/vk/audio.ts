import { BrowserWindow } from 'electron'
import { playVKLibraryTrack, readVKLibraryLink, stopVKAudioPage } from './audio-page'

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
    const closeWithHost = () => this.close()
    main.once('closed', closeWithHost)
    view.once('closed', () => {
      main.off('closed', closeWithHost)
      if (this.view === view) this.view = null
    })
    return view
  }

  private async execute<T>(view: BrowserWindow, code: string): Promise<T> {
    return view.webContents.executeJavaScriptInIsolatedWorld(this.world, [{ code }]) as Promise<T>
  }

  private async load(view: BrowserWindow, address: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        view.webContents.loadURL(address),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (!view.webContents.isDestroyed()) view.webContents.stop()
            reject(
              new Error(
                'Страница VK не загрузилась за 20 секунд. Проверь сеть или подключение VK.',
              ),
            )
          }, 20000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async stopPage(): Promise<void> {
    const view = this.view
    if (!view || view.webContents.isDestroyed()) return
    if (view.webContents.isLoadingMainFrame()) view.webContents.stop()
    try {
      await this.execute(view, `(${stopVKAudioPage.toString()})()`)
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
    const stopped = this.stopPage()
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
        if (!current || (personal && personal !== current))
          await this.load(view, personal ?? 'https://vk.com/audio')
        if (cancelled()) return { playing: false }
        // Catalogue home is not the user's list. Follow the same public tab as
        // the export adapter, including vk.com -> vk.ru redirects and hydration.
        for (let attempt = 0; attempt < 40; attempt++) {
          if (cancelled() || view.webContents.isDestroyed()) return { playing: false }
          const link = vkLibraryURL(
            await this.execute<string | null>(view, `(${readVKLibraryLink.toString()})()`),
          )
          if (link && view.webContents.getURL() !== link) {
            await this.load(view, link)
            break
          }
          if (vkLibraryURL(view.webContents.getURL())) break
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
        if (cancelled()) return { playing: false }
        if (!vkLibraryURL(view.webContents.getURL()))
          return {
            playing: false,
            error:
              'VK не открыл личную медиатеку. Открой «Подключения → VK» и перейди в «Мою музыку», затем повтори прослушивание.',
          }
        await this.stopPage()
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
        const interrupted = new Promise<never>((_resolve, reject) => {
          const abort = () => reject(new Error('Поиск оригинала VK отменён.'))
          if (cancellation.signal.aborted) abort()
          else cancellation.signal.addEventListener('abort', abort, { once: true })
        })
        const result = await Promise.race([
          this.execute<VKAudioResult>(
            view,
            `(${playVKLibraryTrack.toString()})(${JSON.stringify(track)})`,
          ),
          interrupted,
        ])
        if (cancelled()) return { playing: false }
        if (result.playing) {
          this.playing = true
          this.currentKey = key
          this.lastTrack = track
        } else {
          await this.stopPage()
          view.webContents.setAudioMuted(true)
        }
        return result
      } catch (error) {
        if (cancelled()) return { playing: false }
        const message = error instanceof Error ? error.message : String(error)
        return {
          playing: false,
          error: /ERR_NAME_NOT_RESOLVED/.test(message)
            ? 'Не удалось связаться с серверами VK. Проверь сеть.'
            : message,
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
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.setAudioMuted(true)
    if (starting) {
      this.view?.destroy()
      this.view = null
      return { playing: false }
    }
    await this.stopPage()
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
    if (this.view && !this.view.isDestroyed()) this.view.destroy()
    this.view = null
  }
}
