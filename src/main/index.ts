import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveResource } from './platform/files'
import { registerIpc } from './ipc/register'
import { Jobs } from './jobs/runner'
import { configureSpotifyNetwork, configureVKNetwork } from './platform/network'
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
    })

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
