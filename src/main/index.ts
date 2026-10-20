import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { z } from 'zod'
import { Store } from './store'
import { Spotify } from './spotify'
import { Jobs } from './jobs'
import { SpotifyBrowser } from './spotify-browser'
import { VKAudioPlayer } from './vk-audio'
import { VKSessionManager } from './vk-session'
import { configureSpotifyNetwork, configureVKNetwork, testProxy } from './network'
import {
  previewImportDialog,
  exportCollectionDialog,
  linkFileDialog,
  prepareLocalDialog,
  executeSpotifyHelper,
  openExternalSafely,
  resolveResource,
} from './files'
import {
  rawTrackSchema,
  completenessSchema,
  collectionSchema,
  workingPatchSchema,
  settingsSchema,
  type AppState,
  type Result,
} from '../shared/model'

let main: BrowserWindow
const backgroundTest =
  process.env.VKSPOT_BACKGROUND_TEST === '1' && Boolean(process.env.VKSPOT_DATA_DIR)
let store: Store
let spotify: Spotify
let jobs: Jobs
let spotifyBrowser: SpotifyBrowser
let vkAudio: VKAudioPlayer
let vkSession: VKSessionManager

const changed = () => {
  if (main && !main.isDestroyed()) main.webContents.send('vkspot:change')
}

const uuid = z.string().uuid()
const previewSchema = z.object({
  name: z.string().min(1),
  origin: z.string(),
  tracks: z.array(rawTrackSchema),
  completeness: completenessSchema,
  restored: z.preprocess((v) => (v === null ? undefined : v), collectionSchema.optional()),
  range: z.preprocess(
    (v) => (v === null ? undefined : v),
    z
      .object({
        from: z.number().int().positive(),
        to: z.number().int().positive(),
      })
      .optional(),
  ),
})

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
    if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) {
      return { ok: false, error: 'Источник команды не разрешён.' }
    }
    try {
      return { ok: true, value: await fn(...args) }
    } catch (error) {
      console.error(`[IPC Error: ${name}]`, error)
      return {
        ok: false,
        error:
          error instanceof z.ZodError
            ? `Некорректные данные (${error.issues.map((i) => `${i.path.join('.') || 'корень'}: ${i.message}`).join(', ')})`
            : error instanceof Error
              ? error.message
              : 'Не удалось выполнить действие.',
      }
    }
  })
}

function connectHandlers(dataPath: string): void {
  handler('state', (): AppState => ({
    collections: store.all(),
    jobs: store.jobs(),
    settings: store.settings(),
    spotify: { connected: spotify.connected(), name: store.value('spotifyName', '') },
    vk: vkSession.getStatus(),
    spotifyBrowser: spotifyBrowser.snapshot(),
    dataPath,
  }))

  handler('previewImport', () => previewImportDialog(main))

  handler('importCollection', (preview) => {
    const parsed = previewSchema.parse(preview)
    const id = store.import(parsed)
    changed()
    return id
  })

  handler('renameCollection', (id, name) => {
    store.renameCollection(uuid.parse(id), z.string().min(1).max(200).parse(name))
    changed()
  })

  handler('deleteCollection', (id) => {
    store.deleteCollection(uuid.parse(id))
    changed()
  })

  handler('reorderCollections', (ids) => {
    store.reorderCollections(z.array(uuid).parse(ids))
    changed()
  })

  handler('repairCollection', (id, preview) => {
    const result = store.repairCollection(uuid.parse(id), previewSchema.parse(preview))
    changed()
    return result
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

  handler('exportCollection', (id, format) => exportCollectionDialog(main, store, id, format))

  handler('linkFile', async (id, rowId) => {
    await linkFileDialog(main, store, id, rowId)
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
    } else if (proxyChanged && spotify.hasSession()) {
      await verifySpotifyProfile()
    }
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

  handler('openExternal', openExternalSafely)

  handler('playVKTrack', async (track) => {
    const schema = z.object({
      id: z.string().optional(),
      artist: z.string(),
      title: z.string(),
    })
    const parsed = schema.parse(track)
    return await vkAudio.play(parsed)
  })

  handler('pauseVKTrack', async () => await vkAudio.pause())
  handler('resumeVKTrack', async () => await vkAudio.resume())

  handler('testProxy', (proxyUrl, target) => testProxy(proxyUrl, target))

  handler('openVK', () => vkSession.openVK())
  handler('extractVK', (options) => vkSession.extractVK(options))
  handler('cancelVKExtraction', () => vkSession.cancelVKExtraction())
  handler('clearVK', () => vkSession.clearVK())

  handler('prepareLocal', (id) => prepareLocalDialog(main, store, id))
  handler('helper', (action) => executeSpotifyHelper(action))
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app
  .whenReady()
  .then(async () => {
    if (process.env.VKSPOT_DATA_DIR) app.setPath('userData', process.env.VKSPOT_DATA_DIR)
    const dataPath = app.getPath('userData')
    mkdirSync(dataPath, { recursive: true })
    store = new Store(join(dataPath, 'collection.db'))

    await configureSpotifyNetwork(store.settings().spotifyProxy)
    await configureVKNetwork(store.settings().useProxyForVK, store.settings().vkProxy)

    spotify = new Spotify(join(dataPath, 'spotify.enc'), (url, init) =>
      session.fromPartition('vkspot-spotify-api').fetch(url, init),
    )
    spotifyBrowser = new SpotifyBrowser(() => main, changed)
    vkAudio = new VKAudioPlayer(() => main)

    vkSession = new VKSessionManager({
      backgroundTest,
      onChange: changed,
      onProgress: (progress) => {
        if (!main.isDestroyed()) main.webContents.send('vkspot:vk-progress', progress)
      },
      resolveResource,
    })

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

    main.webContents.setUserAgent(
      main.webContents.getUserAgent().replace(/\s(?:Electron|VKSpot|vkspot)\/\S+/g, ''),
    )

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
