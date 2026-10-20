import { BrowserWindow, WebContentsView } from 'electron'
import { readFileSync } from 'node:fs'
import { classifyVKPage, readVKPageSignals } from './status'
import { vkExportOptionsSchema, vkImportPreview, vkProgressSchema } from '../../../core/vk-import'
import type { ImportPreview, VKStatus } from '../../../shared/model'

export interface VKSessionOptions {
  backgroundTest: boolean
  onChange: () => void
  onProgress: (progress: unknown) => void
  resolveResource: (path: string) => string
}

export class VKSessionManager {
  private vkWindow: BrowserWindow | null = null
  private vkView: WebContentsView | null = null
  private vkExtracting = false
  private readonly vkWorld = 1001
  private vkStatus: VKStatus = { state: 'unknown' }
  private vkLastChecked: VKStatus = { state: 'unknown' }
  private vkCheckRevision = 0
  private vkNavigationURL: string | null = null

  constructor(private readonly options: VKSessionOptions) {}

  public getStatus(): VKStatus {
    return { ...this.vkStatus }
  }

  private beginVKCheck(): void {
    if (this.vkStatus.state === 'checking') return
    this.vkStatus = {
      state: 'checking',
      message: 'Проверяем видимое содержимое VK…',
      ...(this.vkLastChecked.checkedAt ? { checkedAt: this.vkLastChecked.checkedAt } : {}),
    }
    this.options.onChange()
  }

  private finishVKCheck(result: Pick<VKStatus, 'state' | 'message'>): void {
    ++this.vkCheckRevision
    const completed: VKStatus = { ...result, checkedAt: new Date().toISOString() }
    this.vkStatus = completed
    this.vkLastChecked = completed
    this.options.onChange()
  }

  private resetVKStatus(message: string): void {
    ++this.vkCheckRevision
    this.vkStatus = { state: 'unknown', message }
    this.vkLastChecked = { ...this.vkStatus }
    this.options.onChange()
  }

  private async checkVKPage(contents: Electron.WebContents): Promise<void> {
    if (
      contents.isDestroyed() ||
      (contents === this.vkView?.webContents && this.vkNavigationURL !== null)
    ) {
      return
    }
    const revision = ++this.vkCheckRevision
    this.beginVKCheck()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const signals = (await Promise.race([
        contents.executeJavaScriptInIsolatedWorld(this.vkWorld, [
          { code: `(${readVKPageSignals.toString()})()` },
        ]),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Проверка страницы VK превысила 12 секунд.')),
            12000,
          )
        }),
      ])) as { personalLibrary?: unknown; signInForm?: unknown; pageError?: unknown } | null
      if (
        revision !== this.vkCheckRevision ||
        contents.isDestroyed() ||
        contents !== this.vkView?.webContents
      ) {
        return
      }
      if (
        !signals ||
        typeof signals.personalLibrary !== 'boolean' ||
        typeof signals.signInForm !== 'boolean' ||
        typeof signals.pageError !== 'boolean'
      ) {
        this.finishVKCheck({ state: 'unknown', message: 'Статус не подтверждён по странице VK.' })
        return
      }
      this.finishVKCheck(
        classifyVKPage(
          signals as {
            personalLibrary: boolean
            signInForm: boolean
            pageError: boolean
          },
        ),
      )
    } catch {
      if (
        revision === this.vkCheckRevision &&
        !contents.isDestroyed() &&
        contents === this.vkView?.webContents
      ) {
        this.finishVKCheck({ state: 'error', message: 'Не удалось проверить страницу VK.' })
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private failVKLoad(contents: Electron.WebContents, failedURL?: string): void {
    if (contents.isDestroyed() || contents !== this.vkView?.webContents) return
    if (failedURL && failedURL !== this.vkNavigationURL) return
    this.vkNavigationURL = null
    ++this.vkCheckRevision
    this.finishVKCheck({ state: 'error', message: 'Не удалось загрузить страницу VK.' })
  }

  private restoreVKStatusOnClose(): void {
    ++this.vkCheckRevision
    this.vkNavigationURL = null
    if (this.vkStatus.state === 'checking') this.vkStatus = { ...this.vkLastChecked }
    this.options.onChange()
  }

  public openVK(): void {
    if (this.vkWindow && !this.vkWindow.isDestroyed()) {
      this.vkWindow.focus()
      if (
        this.vkView &&
        !this.vkView.webContents.isLoadingMainFrame() &&
        this.vkNavigationURL === null
      ) {
        void this.checkVKPage(this.vkView.webContents)
      }
      return
    }
    this.vkWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      show: !this.options.backgroundTest,
      ...(this.options.backgroundTest ? { opacity: 0, skipTaskbar: true, focusable: false } : {}),
      title: 'VKSpot — VK Музыка',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    })
    this.vkView = new WebContentsView({
      webPreferences: {
        partition: 'persist:vkspot-vk',
        backgroundThrottling: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    const contents = this.vkView.webContents
    contents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
      if (mainFrame && contents === this.vkView?.webContents && !contents.isDestroyed()) {
        this.vkNavigationURL = inPlace ? null : url
        ++this.vkCheckRevision
        this.beginVKCheck()
      }
    })
    contents.on('did-finish-load', () => {
      if (contents !== this.vkView?.webContents || contents.isDestroyed()) return
      this.vkNavigationURL = null
      void this.checkVKPage(contents)
    })
    contents.on('did-navigate-in-page', (_event, _url, mainFrame) => {
      if (mainFrame) void this.checkVKPage(contents)
    })
    contents.on('did-fail-load', (_event, errorCode, _description, url, mainFrame) => {
      if (mainFrame && errorCode !== -3) this.failVKLoad(contents, url)
    })
    this.vkWindow.contentView.addChildView(this.vkView)
    const resize = () => {
      if (this.vkWindow && this.vkView) {
        const [width, height] = this.vkWindow.getContentSize()
        this.vkView.setBounds({ x: 0, y: 0, width, height })
      }
    }
    resize()
    if (this.options.backgroundTest) {
      this.vkWindow.setIgnoreMouseEvents(true)
      this.vkWindow.showInactive()
    }
    this.vkWindow.on('resize', resize)
    const allowed = (url: string) => {
      try {
        const parsed = new URL(url)
        return (
          parsed.protocol === 'https:' &&
          ['vk.com', 'vk.ru', 'id.vk.com', 'id.vk.ru', 'login.vk.com', 'login.vk.ru'].includes(
            parsed.hostname,
          )
        )
      } catch {
        return false
      }
    }
    this.vkView.webContents.on('will-navigate', (event, url) => {
      if (!allowed(url)) event.preventDefault()
    })
    this.vkView.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) void this.vkView?.webContents.loadURL(url)
      return { action: 'deny' }
    })
    this.vkView.webContents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    )
    const ownedWindow = this.vkWindow
    const ownedView = this.vkView
    this.vkWindow.on('closed', () => {
      if (this.vkWindow !== ownedWindow) return
      this.restoreVKStatusOnClose()
      ownedView?.webContents.close()
      this.vkWindow = null
      this.vkView = null
    })
    void contents
      .loadURL('https://vk.com/audio')
      .catch(() => this.failVKLoad(contents, 'https://vk.com/audio'))
  }

  public async extractVK(options: unknown): Promise<ImportPreview> {
    if (this.vkExtracting) throw new Error('Сбор VK уже выполняется.')
    const parsedOptions = vkExportOptionsSchema.parse(options ?? {})
    const { expectedCount, rangeFrom, rangeTo, limit } = parsedOptions
    const targetExpected = rangeTo && rangeFrom ? rangeTo - rangeFrom + 1 : (limit ?? expectedCount)
    if (!this.vkView || this.vkView.webContents.isDestroyed()) {
      this.openVK()
      throw new Error(
        'Сначала откройте VK. Авторизуйтесь и перейдите в раздел «Моя музыка», затем запустите выгрузку.',
      )
    }
    const parsed = new URL(this.vkView.webContents.getURL())
    if (
      !['vk.com', 'vk.ru'].includes(parsed.hostname) ||
      !/^\/(audio|music)/.test(parsed.pathname)
    ) {
      if (this.vkWindow && !this.vkWindow.isDestroyed()) this.vkWindow.focus()
      throw new Error('В окне VK перейдите в раздел «Моя музыка» перед запуском выгрузки.')
    }
    const contents = this.vkView.webContents
    this.vkExtracting = true
    let active = true
    let polling = false
    let lastCollected = 0
    let lastProgressAt = Date.now()
    let releaseWatch = () => {}
    const poll = setInterval(async () => {
      if (polling || contents.isDestroyed()) return
      polling = true
      try {
        const value = await contents.executeJavaScriptInIsolatedWorld(this.vkWorld, [
          {
            code: 'globalThis.__VKSPOT_EXPORT__ ? ({collected: globalThis.__VKSPOT_EXPORT__.collected, expected: globalThis.__VKSPOT_EXPORT__.expected, message: globalThis.__VKSPOT_EXPORT__.message}) : null',
          },
        ])
        const progress = vkProgressSchema.safeParse(value)
        if (progress.success && progress.data.collected > lastCollected) {
          lastCollected = progress.data.collected
          lastProgressAt = Date.now()
        }
        if (active && progress.success) {
          this.options.onProgress({
            ...progress.data,
            expected: targetExpected ?? progress.data.expected,
          })
        }
      } catch {
        /* The page may close or navigate while a snapshot is pending. */
      } finally {
        polling = false
      }
    }, 800)

    try {
      const myMusicURL: unknown = await contents.executeJavaScriptInIsolatedWorld(this.vkWorld, [
        {
          code: `(() => { const tab = document.querySelector('[data-testid="AudioCatalog_Tabs_Tab_all"]'); return tab && tab.getAttribute('aria-selected') !== 'true' ? tab.href : null })()`,
        },
      ])
      if (typeof myMusicURL === 'string') {
        const target = new URL(myMusicURL)
        if (
          target.protocol !== 'https:' ||
          !['vk.com', 'vk.ru'].includes(target.hostname) ||
          !/^\/(audio|music)/.test(target.pathname)
        ) {
          throw new Error(
            'VK вернул неподдерживаемую ссылку «Моя музыка». Откройте этот раздел вручную.',
          )
        }
        this.options.onProgress({
          collected: 0,
          expected: expectedCount,
          message: 'Открываем «Моя музыка»…',
        })
        await contents.loadURL(target.href)
      }

      const interrupted = new Promise<never>((_resolve, reject) => {
        const destroyed = () => reject(new Error('Окно VK закрыто. Список не сохранён.'))
        const navigating = (
          _event: Electron.Event,
          _url: string,
          inPlace: boolean,
          mainFrame: boolean,
        ) => {
          if (mainFrame && !inPlace) {
            reject(
              new Error(
                'Чтение VK прервано сменой страницы. Откройте «Моя музыка» и повторите сбор.',
              ),
            )
          }
        }
        const deadline = setInterval(() => {
          if (Date.now() - lastProgressAt < 3 * 60 * 1000) return
          if (!contents.isDestroyed()) {
            void contents
              .executeJavaScriptInIsolatedWorld(this.vkWorld, [
                {
                  code: 'if (globalThis.__VKSPOT_EXPORT__) globalThis.__VKSPOT_EXPORT__.cancelled = true; undefined',
                },
              ])
              .catch(() => {})
          }
          reject(new Error('VK не сообщает о новых записях уже 3 минуты. Повторите выгрузку.'))
        }, 5000)
        contents.once('destroyed', destroyed)
        contents.on('did-start-navigation', navigating)
        releaseWatch = () => {
          clearInterval(deadline)
          contents.removeListener('destroyed', destroyed)
          contents.removeListener('did-start-navigation', navigating)
        }
      })

      const configCode = `globalThis.__VKSPOT_EXPORT_CONFIG__ = ${JSON.stringify({
        expectedCount,
        rangeFrom,
        rangeTo,
        limit,
      })};`
      const exportScript = readFileSync(this.options.resolveResource('vk-export.js'), 'utf8')
      const data: unknown = await Promise.race([
        contents.executeJavaScriptInIsolatedWorld(
          this.vkWorld,
          [{ code: `${configCode}\n${exportScript}` }],
          true,
        ),
        interrupted,
      ])
      if (!data || typeof data !== 'object') {
        throw new Error(
          'Скрипт VK не вернул данные. Убедитесь, что окно VK открыто на странице «Моя музыка» и список треков загружен.',
        )
      }
      const payload = data as { ok?: boolean; error?: string; result?: unknown }
      if (payload.ok === false) {
        throw new Error(payload.error || 'Ошибка при выгрузке из VK.')
      }
      const exportResult = payload.result ?? data
      const preview = vkImportPreview(exportResult, parsedOptions)
      this.finishVKCheck({ state: 'connected', message: 'Успешно прочитана личная библиотека VK.' })
      return preview
    } catch (error) {
      if (contents.isDestroyed()) {
        throw new Error('Окно VK закрыто. Список не сохранён. Откройте VK и повторите сбор.', {
          cause: error,
        })
      }
      if (
        error instanceof Error &&
        /context was destroyed|frame was disposed|object has been destroyed/i.test(error.message)
      ) {
        throw new Error(
          'Чтение VK прервано сменой страницы. Откройте «Моя музыка» и повторите сбор.',
          { cause: error },
        )
      }
      throw error
    } finally {
      releaseWatch()
      active = false
      clearInterval(poll)
      this.vkExtracting = false
      this.options.onProgress(null)
    }
  }

  public async cancelVKExtraction(): Promise<void> {
    if (!this.vkExtracting || !this.vkView || this.vkView.webContents.isDestroyed()) return
    await this.vkView.webContents.executeJavaScriptInIsolatedWorld(this.vkWorld, [
      {
        code: 'if (globalThis.__VKSPOT_EXPORT__) globalThis.__VKSPOT_EXPORT__.cancelled = true; undefined',
      },
    ])
  }

  public async clearVK(): Promise<void> {
    if (!this.vkView) throw new Error('Откройте окно VK, затем очистите сессию.')
    const contents = this.vkView.webContents
    this.resetVKStatus('Сессия VK очищается; статус не подтверждён.')
    await contents.session.clearStorageData()
    this.resetVKStatus('Сессия VK очищена; статус ещё не проверен.')
    if (contents.isDestroyed()) throw new Error('Окно VK закрыто.')
    await contents.loadURL('https://vk.com/audio')
  }
}
