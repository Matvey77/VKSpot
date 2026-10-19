import { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, session } from 'electron'
import { join, extname, basename } from 'node:path'
import { mkdirSync, readFileSync, createReadStream, promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { parseFile } from 'music-metadata'
import { Store } from './store'
import { Spotify } from './spotify'
import { Jobs } from './jobs'
import { SpotifyBrowser } from './spotify-browser'
import { VKAudioPlayer } from './vk-audio'
import { exportText, parseImport } from '../core/collection'
import { vkExportOptionsSchema, vkImportPreview, vkProgressSchema } from '../core/vk-import'
import {
  rawTrackSchema,
  completenessSchema,
  collectionSchema,
  workingPatchSchema,
  settingsSchema,
  type AppState,
  type ImportPreview,
  type Result,
  type VKStatus,
} from '../shared/model'
import { classifyVKPage, readVKPageSignals } from './vk-status'

let main: BrowserWindow
let vkWindow: BrowserWindow | null = null
let vkView: WebContentsView | null = null
let vkExtracting = false
const vkWorld = 1001
let vkStatus: VKStatus = { state: 'unknown' }
let vkLastChecked: VKStatus = { state: 'unknown' }
let vkCheckRevision = 0
let vkNavigationURL: string | null = null
const backgroundTest =
  process.env.VKSPOT_BACKGROUND_TEST === '1' && Boolean(process.env.VKSPOT_DATA_DIR)
let store: Store
let spotify: Spotify
let spotifyNetwork: Electron.Session
let jobs: Jobs
let spotifyBrowser: SpotifyBrowser
let vkAudio: VKAudioPlayer
const changed = () => {
  if (main && !main.isDestroyed()) main.webContents.send('vkspot:change')
}
const beginVKCheck = () => {
  if (vkStatus.state === 'checking') return
  vkStatus = {
    state: 'checking',
    message: 'Проверяем видимое содержимое VK…',
    ...(vkLastChecked.checkedAt ? { checkedAt: vkLastChecked.checkedAt } : {}),
  }
  changed()
}
const finishVKCheck = (result: Pick<VKStatus, 'state' | 'message'>) => {
  ++vkCheckRevision
  const completed: VKStatus = { ...result, checkedAt: new Date().toISOString() }
  vkStatus = completed
  vkLastChecked = completed
  changed()
}
const resetVKStatus = (message: string) => {
  ++vkCheckRevision
  vkStatus = { state: 'unknown', message }
  vkLastChecked = { ...vkStatus }
  changed()
}
const checkVKPage = async (contents: Electron.WebContents): Promise<void> => {
  if (contents.isDestroyed() || (contents === vkView?.webContents && vkNavigationURL !== null))
    return
  const revision = ++vkCheckRevision
  beginVKCheck()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const signals = (await Promise.race([
      contents.executeJavaScriptInIsolatedWorld(vkWorld, [
        { code: `(${readVKPageSignals.toString()})()` },
      ]),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Проверка страницы VK превысила 12 секунд.')),
          12000,
        )
      }),
    ])) as { personalLibrary?: unknown; signInForm?: unknown; pageError?: unknown } | null
    if (revision !== vkCheckRevision || contents.isDestroyed() || contents !== vkView?.webContents)
      return
    if (
      !signals ||
      typeof signals.personalLibrary !== 'boolean' ||
      typeof signals.signInForm !== 'boolean' ||
      typeof signals.pageError !== 'boolean'
    ) {
      finishVKCheck({ state: 'unknown', message: 'Статус не подтверждён по странице VK.' })
      return
    }
    finishVKCheck(
      classifyVKPage(
        signals as {
          personalLibrary: boolean
          signInForm: boolean
          pageError: boolean
        },
      ),
    )
  } catch {
    if (revision === vkCheckRevision && !contents.isDestroyed() && contents === vkView?.webContents)
      finishVKCheck({ state: 'error', message: 'Не удалось проверить страницу VK.' })
  } finally {
    clearTimeout(timeout)
  }
}
const failVKLoad = (contents: Electron.WebContents, failedURL?: string) => {
  if (contents.isDestroyed() || contents !== vkView?.webContents) return
  if (failedURL && failedURL !== vkNavigationURL) return
  vkNavigationURL = null
  ++vkCheckRevision
  finishVKCheck({ state: 'error', message: 'Не удалось загрузить страницу VK.' })
}
const restoreVKStatusOnClose = () => {
  ++vkCheckRevision
  vkNavigationURL = null
  if (vkStatus.state === 'checking') vkStatus = { ...vkLastChecked }
  changed()
}
const uuid = z.string().uuid()
const previewSchema = z.object({
  name: z.string().min(1),
  origin: z.string(),
  tracks: z.array(rawTrackSchema),
  completeness: completenessSchema,
  restored: collectionSchema.optional(),
})
const localExtensions = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.opus',
  '.aiff',
  '.wma',
])
const exec = promisify(execFile)

async function configureSpotifyNetwork(proxy: string): Promise<void> {
  const networks = [spotifyNetwork, session.fromPartition('persist:vkspot-spotify-browser')]
  for (const network of networks) {
    if (proxy) {
      const url = new URL(proxy)
      const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
      await network.setProxy({
        mode: 'fixed_servers',
        proxyRules: `${protocol}//${url.host}`,
      })
    } else await network.setProxy({ mode: 'system' })
    await network.closeAllConnections()
  }
}

async function configureVKNetwork(useProxy: boolean, proxy: string): Promise<void> {
  const vkSession = session.fromPartition('persist:vkspot-vk')
  if (!useProxy) {
    await vkSession.setProxy({ mode: 'direct' })
  } else if (proxy) {
    const url = new URL(proxy)
    const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
    await vkSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `${protocol}//${url.host}`,
    })
  } else {
    await vkSession.setProxy({ mode: 'system' })
  }
  await vkSession.closeAllConnections()
}

async function verifySpotifyProfile(): Promise<void> {
  try {
    store.setValue('spotifyName', await spotify.profile())
  } catch (error) {
    store.setValue('spotifyName', '')
    throw error
  } finally {
    jobs?.wake()
    changed()
  }
}

function handler(name: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle('vkspot:' + name, async (event, ...args): Promise<Result<unknown>> => {
    if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame)
      return { ok: false, error: 'Источник команды не разрешён.' }
    try {
      return { ok: true, value: await fn(...args) }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof z.ZodError
            ? 'Некорректные данные. Проверьте файл и введённые значения.'
            : error instanceof Error
              ? error.message
              : 'Не удалось выполнить действие.',
      }
    }
  })
}
function resource(path: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scripts', path)
    : join(app.getAppPath(), 'resources', 'scripts', path)
}
function external(url: unknown): Promise<void> {
  const value = z.string().url().parse(url),
    parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    ![
      'open.spotify.com',
      'developer.spotify.com',
      'support.spotify.com',
      'vk.com',
      'vk.ru',
      'accounts.spotify.com',
    ].includes(parsed.hostname)
  )
    throw new Error('Эта внешняя ссылка не разрешена.')
  return shell.openExternal(value)
}
function connectHandlers(dataPath: string): void {
  handler('state', (): AppState => ({
    collections: store.all(),
    jobs: store.jobs(),
    settings: store.settings(),
    spotify: { connected: spotify.connected(), name: store.value('spotifyName', '') },
    vk: { ...vkStatus },
    spotifyBrowser: spotifyBrowser.snapshot(),
    dataPath,
  }))
  handler('previewImport', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(main, {
      title: 'Импортировать список или архив',
      properties: ['openFile'],
      filters: [{ name: 'Список музыки', extensions: ['json', 'csv', 'txt'] }],
    })
    if (canceled) return null
    return parseImport(
      await fs.readFile(filePaths[0], 'utf8'),
      extname(filePaths[0]),
      basename(filePaths[0], extname(filePaths[0])),
    )
  })
  handler('importCollection', (preview) => {
    const parsed = previewSchema.parse(preview)
    const id = store.import(parsed)
    changed()
    return id
  })
  handler('patchRows', (id, ids, patch) => {
    store.patch(uuid.parse(id), z.array(uuid).parse(ids), workingPatchSchema.parse(patch))
    changed()
  })
  handler('undo', (id) => {
    const result = store.undo(uuid.parse(id))
    changed()
    return result
  })
  handler('confirmMetadataMatches', (id, ids) => {
    const result = store.confirmMetadataMatches(uuid.parse(id), z.array(uuid).min(1).parse(ids))
    changed()
    return result
  })
  handler('exportCollection', async (id, format) => {
    const collection = store.get(uuid.parse(id)),
      f = z.enum(['archive', 'raw-json', 'csv', 'm3u8', 'plan']).parse(format)
    const text = exportText(collection, f),
      extension = f === 'csv' ? 'csv' : f === 'm3u8' ? 'm3u8' : 'json'
    const result = await dialog.showSaveDialog(main, {
      defaultPath: `${collection.name.replace(/[<>:"/\\|?*]/g, '_')}-${f}.${extension}`,
      filters: [{ name: 'VKSpot', extensions: [extension] }],
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, text, 'utf8')
    return result.filePath
  })
  handler('linkFile', async (id, rowId) => {
    const collectionId = uuid.parse(id),
      entryId = uuid.parse(rowId)
    if (!store.get(collectionId).rows.some((r) => r.id === entryId))
      throw new Error('Запись не найдена.')
    const result = await dialog.showOpenDialog(main, {
      properties: ['openFile'],
      filters: [{ name: 'Аудио', extensions: [...localExtensions].map((s) => s.slice(1)) }],
    })
    if (result.canceled) return
    const path = result.filePaths[0],
      stat = await fs.stat(path)
    if (!localExtensions.has(extname(path).toLowerCase()))
      throw new Error('Выберите аудиофайл поддерживаемого формата.')
    const metadata = await parseFile(path),
      hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    store.patch(collectionId, [entryId], {
      local: {
        path,
        sha256: hash.digest('hex'),
        artist: metadata.common.artist ?? '',
        title: metadata.common.title ?? '',
        duration: metadata.format.duration ?? null,
        codec: metadata.format.codec ?? metadata.format.container ?? '',
        bitrate: metadata.format.bitrate ?? null,
        size: stat.size,
      },
      destination: 'local',
    })
    changed()
  })
  handler('saveSettings', async (settings) => {
    const parsed = settingsSchema.parse(settings)
    const previous = store.settings()
    const proxyChanged = parsed.spotifyProxy !== previous.spotifyProxy
    if (proxyChanged) {
      await configureSpotifyNetwork(parsed.spotifyProxy)
      spotify.invalidateAccess()
    }
    const vkProxyChanged =
      parsed.useProxyForVK !== previous.useProxyForVK || parsed.vkProxy !== previous.vkProxy
    if (vkProxyChanged) {
      await configureVKNetwork(parsed.useProxyForVK, parsed.vkProxy)
    }
    store.setValue('preferences', parsed)
    changed()
    if (parsed.clientId !== previous.clientId && spotify.hasSession()) {
      jobs.pauseActive()
      spotify.disconnect()
      store.setValue('spotifyName', '')
      changed()
    } else if (proxyChanged && spotify.hasSession()) await verifySpotifyProfile()
    jobs.wake()
  })
  handler('connectSpotify', async () => {
    await spotify.authorize(store.settings().clientId)
    await verifySpotifyProfile()
  })
  handler('disconnectSpotify', () => {
    jobs.pauseActive()
    spotify.disconnect()
    jobs.wake()
    store.setValue('spotifyName', '')
    changed()
  })
  handler('showSpotifyBrowser', async (bounds, owner) => {
    const parsed = z
      .object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        width: z.number().int().min(1).max(10000),
        height: z.number().int().min(1).max(10000),
      })
      .nullable()
      .parse(bounds)
    const parsedOwner = z.string().uuid().optional().parse(owner)
    if (parsed) {
      const [width, height] = main.getContentSize()
      const clamped = {
        x: Math.min(parsed.x, Math.max(0, width - 100)),
        y: Math.min(parsed.y, Math.max(0, height - 100)),
        width: Math.min(parsed.width, Math.max(100, width - parsed.x)),
        height: Math.min(parsed.height, Math.max(100, height - parsed.y)),
      }
      jobs.pauseBrowserActive()
      await spotifyBrowser.show(clamped, parsedOwner)
      return
    }
    await spotifyBrowser.show(null, parsedOwner)
  })
  handler('reloadSpotifyBrowser', async (owner) => {
    const parsedOwner = z.string().uuid().optional().parse(owner)
    await spotifyBrowser.reload(parsedOwner)
  })
  handler('continueSearchInBrowser', (id) => jobs.continueInBrowser(uuid.parse(id)))
  handler('startSearch', (id, ids, background) =>
    jobs.search(
      uuid.parse(id),
      z.array(uuid).parse(ids),
      z.boolean().optional().parse(background) ?? false,
    ),
  )
  handler('startTransfer', (id) => jobs.transfer(uuid.parse(id)))
  handler('controlJob', (id, action) => {
    const jobId = uuid.parse(id)
    if (z.enum(['pause', 'resume']).parse(action) === 'pause') jobs.pause(jobId)
    else jobs.resume(jobId)
  })
  handler('archiveJob', (id) => {
    store.archiveJob(uuid.parse(id))
    changed()
  })
  handler('archiveFinishedJobs', () => {
    const count = store.archiveFinishedJobs()
    changed()
    return count
  })
  handler('reconcileMixed', async (id) => {
    await jobs.reconcileMixed(uuid.parse(id))
    changed()
  })
  handler('recoverPlaylist', async (id, playlistId) => {
    await jobs.recoverPlaylist(
      uuid.parse(id),
      z
        .string()
        .regex(/^[A-Za-z0-9]{22}$/)
        .parse(playlistId),
    )
    changed()
  })
  handler('openExternal', external)
  handler('playVKTrack', async (track) => {
    const schema = z.object({
      id: z.string().optional(),
      artist: z.string(),
      title: z.string(),
    })
    const parsed = schema.parse(track)
    return await vkAudio.play(parsed)
  })
  handler('pauseVKTrack', async () => {
    return await vkAudio.pause()
  })
  handler('resumeVKTrack', async () => {
    return await vkAudio.resume()
  })
  handler('testProxy', async (proxyUrl, target) => {
    const pUrl = typeof proxyUrl === 'string' ? proxyUrl.trim() : ''
    const pTarget = target === 'vk' ? 'vk' : 'spotify'
    const testSession = session.fromPartition('in-memory:test-proxy-' + Date.now())
    try {
      if (pUrl) {
        const url = new URL(pUrl)
        const protocol = url.protocol === 'socks5h:' ? 'socks5:' : url.protocol
        await testSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: `${protocol}//${url.host}`,
        })
      } else {
        await testSession.setProxy({ mode: 'direct' })
      }
      const testUrl = pTarget === 'vk' ? 'https://vk.com/favicon.ico' : 'https://open.spotify.com'
      const start = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await testSession.fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal,
        })
        const latencyMs = Date.now() - start
        return { ok: true, latencyMs, status: response.status }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    } finally {
      await testSession.closeAllConnections()
    }
  })
  handler('openVK', () => {
    if (vkWindow && !vkWindow.isDestroyed()) {
      vkWindow.focus()
      if (vkView && !vkView.webContents.isLoadingMainFrame() && vkNavigationURL === null)
        void checkVKPage(vkView.webContents)
      return
    }
    vkWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      show: !backgroundTest,
      ...(backgroundTest ? { opacity: 0, skipTaskbar: true, focusable: false } : {}),
      title: 'VKSpot — VK Музыка',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    })
    vkView = new WebContentsView({
      webPreferences: {
        partition: 'persist:vkspot-vk',
        backgroundThrottling: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    const contents = vkView.webContents
    contents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
      if (mainFrame && contents === vkView?.webContents && !contents.isDestroyed()) {
        vkNavigationURL = inPlace ? null : url
        ++vkCheckRevision
        beginVKCheck()
      }
    })
    contents.on('did-finish-load', () => {
      if (contents !== vkView?.webContents || contents.isDestroyed()) return
      vkNavigationURL = null
      void checkVKPage(contents)
    })
    contents.on('did-navigate-in-page', (_event, _url, mainFrame) => {
      if (mainFrame) void checkVKPage(contents)
    })
    contents.on('did-fail-load', (_event, errorCode, _description, url, mainFrame) => {
      if (mainFrame && errorCode !== -3) failVKLoad(contents, url)
    })
    vkWindow.contentView.addChildView(vkView)
    const resize = () => {
      if (vkWindow && vkView) {
        const [width, height] = vkWindow.getContentSize()
        vkView.setBounds({ x: 0, y: 0, width, height })
      }
    }
    resize()
    if (backgroundTest) {
      // Native Chromium still needs a shown surface to dispatch real scroll
      // frames. Keep test windows transparent, unfocusable and off the taskbar.
      vkWindow.setIgnoreMouseEvents(true)
      vkWindow.showInactive()
    }
    vkWindow.on('resize', resize)
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
    vkView.webContents.on('will-navigate', (event, url) => {
      if (!allowed(url)) event.preventDefault()
    })
    vkView.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) void vkView?.webContents.loadURL(url)
      return { action: 'deny' }
    })
    vkView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    )
    const ownedWindow = vkWindow
    const ownedView = vkView
    vkWindow.on('closed', () => {
      if (vkWindow !== ownedWindow) return
      restoreVKStatusOnClose()
      ownedView?.webContents.close()
      vkWindow = null
      vkView = null
    })
    void contents
      .loadURL('https://vk.com/audio')
      .catch(() => failVKLoad(contents, 'https://vk.com/audio'))
  })
  handler('extractVK', async (options): Promise<ImportPreview> => {
    if (vkExtracting) throw new Error('Сбор VK уже выполняется.')
    const { expectedCount } = vkExportOptionsSchema.parse(options ?? {})
    if (!vkView || vkView.webContents.isDestroyed())
      throw new Error('Сначала откройте VK и перейдите в «Моя музыка».')
    const parsed = new URL(vkView.webContents.getURL())
    if (!['vk.com', 'vk.ru'].includes(parsed.hostname) || !/^\/(audio|music)/.test(parsed.pathname))
      throw new Error('Откройте страницу «Моя музыка», а не страницу входа.')
    const contents = vkView.webContents
    vkExtracting = true
    let active = true
    let polling = false
    let lastCollected = 0
    let lastProgressAt = Date.now()
    let releaseWatch = () => {}
    const poll = setInterval(async () => {
      if (polling || contents.isDestroyed()) return
      polling = true
      try {
        const value = await contents.executeJavaScriptInIsolatedWorld(vkWorld, [
          {
            code: 'globalThis.__VKSPOT_EXPORT__ ? ({collected: globalThis.__VKSPOT_EXPORT__.collected, expected: globalThis.__VKSPOT_EXPORT__.expected, message: globalThis.__VKSPOT_EXPORT__.message}) : null',
          },
        ])
        const progress = vkProgressSchema.safeParse(value)
        if (progress.success && progress.data.collected > lastCollected) {
          lastCollected = progress.data.collected
          lastProgressAt = Date.now()
        }
        if (active && progress.success && !main.isDestroyed())
          main.webContents.send('vkspot:vk-progress', {
            ...progress.data,
            expected: expectedCount ?? progress.data.expected,
          })
      } catch {
        /* The page may close or navigate while a snapshot is pending. */
      } finally {
        polling = false
      }
    }, 800)
    try {
      // Current VK opens its catalogue home at /audio. The owned library is a
      // different tab; exporting home would mix short recommendation sections.
      const myMusicURL: unknown = await contents.executeJavaScriptInIsolatedWorld(vkWorld, [
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
        )
          throw new Error(
            'VK вернул неподдерживаемую ссылку «Моя музыка». Откройте этот раздел вручную.',
          )
        main.webContents.send('vkspot:vk-progress', {
          collected: 0,
          expected: expectedCount,
          message: 'Открываем «Моя музыка»…',
        })
        await contents.loadURL(target.href)
      }
      // Electron can leave an evaluated page promise pending when its view is
      // closed. Settle the IPC explicitly and always release the running guard.
      const interrupted = new Promise<never>((_resolve, reject) => {
        const destroyed = () => reject(new Error('Окно VK закрыто. Список не сохранён.'))
        const navigating = (
          _event: Electron.Event,
          _url: string,
          inPlace: boolean,
          mainFrame: boolean,
        ) => {
          if (mainFrame && !inPlace)
            reject(
              new Error(
                'Чтение VK прервано сменой страницы. Откройте «Моя музыка» и повторите сбор.',
              ),
            )
        }
        const deadline = setInterval(() => {
          if (Date.now() - lastProgressAt < 3 * 60 * 1000) return
          if (!contents.isDestroyed())
            void contents
              .executeJavaScriptInIsolatedWorld(vkWorld, [
                {
                  code: 'if (globalThis.__VKSPOT_EXPORT__) globalThis.__VKSPOT_EXPORT__.cancelled = true; undefined',
                },
              ])
              .catch(() => {})
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
      const data: unknown = await Promise.race([
        contents.executeJavaScriptInIsolatedWorld(
          vkWorld,
          [{ code: readFileSync(resource('vk-export.js'), 'utf8') }],
          true,
        ),
        interrupted,
      ])
      const preview = vkImportPreview(data, expectedCount)
      finishVKCheck({ state: 'connected', message: 'Успешно прочитана личная библиотека VK.' })
      return preview
    } catch (error) {
      if (contents.isDestroyed())
        throw new Error('Окно VK закрыто. Список не сохранён. Откройте VK и повторите сбор.', {
          cause: error,
        })
      if (
        error instanceof Error &&
        /context was destroyed|frame was disposed|object has been destroyed/i.test(error.message)
      )
        throw new Error(
          'Чтение VK прервано сменой страницы. Откройте «Моя музыка» и повторите сбор.',
          { cause: error },
        )
      throw error
    } finally {
      releaseWatch()
      active = false
      clearInterval(poll)
      vkExtracting = false
      if (!main.isDestroyed()) main.webContents.send('vkspot:vk-progress', null)
    }
  })
  handler('cancelVKExtraction', async () => {
    if (!vkExtracting || !vkView || vkView.webContents.isDestroyed()) return
    await vkView.webContents.executeJavaScriptInIsolatedWorld(vkWorld, [
      {
        code: 'if (globalThis.__VKSPOT_EXPORT__) globalThis.__VKSPOT_EXPORT__.cancelled = true; undefined',
      },
    ])
  })
  handler('clearVK', async () => {
    if (!vkView) throw new Error('Откройте окно VK, затем очистите сессию.')
    const contents = vkView.webContents
    resetVKStatus('Сессия VK очищается; статус не подтверждён.')
    await contents.session.clearStorageData()
    resetVKStatus('Сессия VK очищена; статус ещё не проверен.')
    if (contents.isDestroyed()) throw new Error('Окно VK закрыто.')
    await contents.loadURL('https://vk.com/audio')
  })
  handler('prepareLocal', async (id) => {
    const collection = store.get(uuid.parse(id))
    const plan = collection.rows.map((row) => ({
      rowId: row.id,
      position: row.position,
      artist: row.working.artist,
      title: row.working.title,
      version: row.working.version,
      excluded: row.working.excluded,
      destination: row.working.destination,
      uri: row.working.spotify?.uri ?? null,
      local: row.working.local,
    }))
    const local = plan.filter((p) => !p.excluded && p.destination === 'local' && p.local)
    if (!local.length) throw new Error('В плане нет локальных файлов.')
    const choice = await dialog.showOpenDialog(main, {
      title: 'Папка для копии локальных файлов',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (choice.canceled) return null
    const folder = join(choice.filePaths[0], `VKSpot-${collection.id.slice(0, 8)}`)
    await fs.mkdir(folder, { recursive: true })
    const manifest = []
    for (const item of local) {
      const file = item.local!,
        extension = extname(file.path).toLowerCase()
      if (!localExtensions.has(extension))
        throw new Error('В архиве указан неподдерживаемый локальный файл.')
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(file.path)) hash.update(chunk)
      if (hash.digest('hex') !== file.sha256)
        throw new Error(`Файл записи №${item.position} изменился. Привяжите его заново.`)
      const filename = `${String(item.position).padStart(6, '0')}-${item.rowId.slice(0, 8)}${extension}`
      const target = join(folder, filename)
      try {
        await fs.copyFile(file.path, target, 1)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        const existing = createHash('sha256')
        for await (const chunk of createReadStream(target)) existing.update(chunk)
        if (existing.digest('hex') !== file.sha256)
          throw new Error('В папке уже есть другой файл с этим именем. Выберите новую папку.', {
            cause: e,
          })
      }
      manifest.push({ ...item, preparedPath: target })
    }
    await fs.writeFile(
      join(folder, 'transfer-plan.json'),
      JSON.stringify(
        {
          format: 'vkspot-local-bundle',
          version: 1,
          sourceHash: collection.sourceHash,
          fullPlan: plan,
          local: manifest,
        },
        null,
        2,
      ),
    )
    await fs.writeFile(
      join(folder, 'local.m3u8'),
      '#EXTM3U\n' +
        manifest
          .map(
            (p) =>
              `#EXTINF:${p.local?.duration ?? -1},${p.artist.replace(/[\r\n]/g, ' ')} - ${p.title.replace(/[\r\n]/g, ' ')}\n${basename(p.preparedPath)}`,
          )
          .join('\n'),
    )
    await fs.writeFile(
      join(folder, 'READ_ME.txt'),
      'VKSpot: файлы скопированы без перекодирования. Исходные файлы не изменены.\nПодключите эту папку в настройках Spotify → Локальные файлы. Добавьте записи в плейлист. transfer-plan.json содержит полный смешанный порядок.\nИмена файлов обозначают позиции; они не заменяют встроенные теги. Мобильное устройство требует отдельной копии файлов.\n',
    )
    return folder
  })
  handler('helper', async (action) => {
    if (process.platform !== 'win32')
      throw new Error('Системный помощник этой сборки доступен только на Windows.')
    const a = z.enum(['inspect', 'open-spotify']).parse(action)
    const result = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resource('windows/spotify-helper.ps1'),
        '-Action',
        a,
      ],
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
    )
    return result.stdout
  })
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app
  .whenReady()
  .then(async () => {
    if (process.env.VKSPOT_DATA_DIR) app.setPath('userData', process.env.VKSPOT_DATA_DIR)
    const dataPath = app.getPath('userData')
    mkdirSync(dataPath, { recursive: true })
    store = new Store(join(dataPath, 'collection.db'))
    spotifyNetwork = session.fromPartition('vkspot-spotify-api')
    await configureSpotifyNetwork(store.settings().spotifyProxy)
    await configureVKNetwork(store.settings().useProxyForVK, store.settings().vkProxy)
    spotify = new Spotify(join(dataPath, 'spotify.enc'), (url, init) =>
      spotifyNetwork.fetch(url, init),
    )
    spotifyBrowser = new SpotifyBrowser(() => main, changed)
    vkAudio = new VKAudioPlayer(() => main)
    main = new BrowserWindow({
      width: 1440,
      height: 920,
      show: !backgroundTest,
      ...(backgroundTest ? { opacity: 0, skipTaskbar: true, focusable: false } : {}),
      minWidth: 940,
      minHeight: 640,
      title: 'VKSpot',
      icon: app.isPackaged
        ? join(process.resourcesPath, 'icon.png')
        : join(app.getAppPath(), 'resources/icon.png'),
      backgroundColor: '#f4f6f5',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    main.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://open.spotify.com/') || url.startsWith('https://spotify.com/')) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })
    jobs = new Jobs(store, spotify, changed, spotifyBrowser)
    if (backgroundTest) {
      main.setIgnoreMouseEvents(true)
      main.showInactive()
    }
    main.webContents.on('will-navigate', (event) => event.preventDefault())
    connectHandlers(dataPath)
    if (process.env.ELECTRON_RENDERER_URL) void main.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void main.loadFile(join(__dirname, '../renderer/index.html'))
    if (spotify.hasSession()) void verifySpotifyProfile().catch(() => {})
    app.on('before-quit', () => {
      jobs.shutdown()
      spotifyBrowser.close()
      vkAudio.close()
    })
    app.on('window-all-closed', () => app.quit())
  })
  .catch((error) => {
    dialog.showErrorBox('VKSpot', String(error))
    app.quit()
  })
