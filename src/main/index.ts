import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveResource } from './platform/files'
import { registerIpc } from './ipc/register'
import { resolveDevRendererUrl } from './ipc/router'
import { Jobs } from './jobs/runner'
import { configureSpotifyNetwork, configureVKNetwork } from './platform/network'
import { proxySchema } from '../shared/model'
import { Spotify } from './integrations/spotify/api'
import { SpotifyBrowser } from './integrations/spotify/browser'
import { Store } from './storage'
import { VKAudioPlayer } from './integrations/vk/audio'
import { VKSessionManager } from './integrations/vk/session'

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

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'linux' && app.commandLine.hasSwitch('no-sandbox')) {
      throw new Error(
        'Системная песочница Chromium недоступна. Включите пользовательские пространства имён или установите пакет DEB.',
      )
    }
    if (process.env.VKSPOT_DATA_DIR) app.setPath('userData', process.env.VKSPOT_DATA_DIR)
    const dataPath = app.getPath('userData')
    mkdirSync(dataPath, { recursive: true })
    store = new Store(join(dataPath, 'collection.db'))

    const startupSettings = store.settings()
    const spotifyProxy = proxySchema.safeParse(startupSettings.spotifyProxy)
    const vkProxy = proxySchema.safeParse(startupSettings.vkProxy)
    await configureSpotifyNetwork(spotifyProxy.success ? spotifyProxy.data : '')
    await configureVKNetwork(
      startupSettings.useProxyForVK && vkProxy.success,
      vkProxy.success ? vkProxy.data : '',
    )

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    )
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.on('will-download', (event) => event.preventDefault())

    spotify = new Spotify(join(dataPath, 'spotify.enc'), (url, init) =>
      session.fromPartition('vkspot-spotify-api').fetch(url, init),
    )
    spotifyBrowser = new SpotifyBrowser(() => main, changed)
    vkAudio = new VKAudioPlayer(
      () => main,
      () => vkSession.libraryURL(),
      (message) => {
        if (main && !main.isDestroyed()) main.webContents.send('vkspot:vk-audio-progress', message)
      },
    )

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
      ...(backgroundTest
        ? {
            ...(process.platform === 'win32' ? { opacity: 0 } : {}),
            skipTaskbar: true,
            focusable: false,
          }
        : {}),
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
      try {
        const parsed = new URL(url)
        if (
          parsed.protocol === 'https:' &&
          !parsed.username &&
          !parsed.password &&
          (parsed.hostname === 'open.spotify.com' || parsed.hostname === 'spotify.com')
        ) {
          void shell.openExternal(parsed.href)
        }
      } catch {
        // Ignore invalid window.open URLs.
      }
      return { action: 'deny' }
    })

    jobs = new Jobs(store, spotify, changed, spotifyBrowser)

    if (backgroundTest) {
      main.setIgnoreMouseEvents(true)
      main.showInactive()
    }

    main.webContents.on('will-navigate', (event) => event.preventDefault())
    main.webContents.on('will-redirect', (event) => event.preventDefault())
    main.webContents.on('will-frame-navigate', (details) => {
      if (details.isMainFrame) {
        details.preventDefault()
        return
      }
      try {
        const parsed = new URL(details.url)
        if (
          parsed.protocol !== 'https:' ||
          parsed.hostname !== 'open.spotify.com' ||
          parsed.username ||
          parsed.password
        ) {
          details.preventDefault()
        }
      } catch {
        details.preventDefault()
      }
    })
    const rendererFilePath = join(__dirname, '../renderer/index.html')
    const devRendererUrl = resolveDevRendererUrl()
    registerIpc({
      main,
      store,
      spotify,
      jobs,
      spotifyBrowser,
      vkAudio,
      vkSession,
      dataPath,
      changed,
      verifySpotifyProfile,
      rendererFilePath,
      devRendererUrl,
    })

    if (devRendererUrl) void main.loadURL(devRendererUrl)
    else void main.loadFile(rendererFilePath)

    if (spotify.hasSession()) void verifySpotifyProfile().catch(() => {})

    app.on('before-quit', () => {
      jobs.shutdown()
      spotifyBrowser.close()
      vkAudio.close()
      store.close()
    })
    app.on('window-all-closed', () => app.quit())
  })
  .catch((error) => {
    dialog.showErrorBox('VKSpot', String(error))
    app.quit()
  })
