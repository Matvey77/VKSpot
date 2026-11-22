import type { BrowserWindow } from 'electron'
import { Jobs } from '../jobs/runner'
import { Spotify } from '../integrations/spotify/api'
import { SpotifyBrowser } from '../integrations/spotify/browser'
import { Store } from '../storage'
import { VKAudioPlayer } from '../integrations/vk/audio'
import { VKSessionManager } from '../integrations/vk/session'
import { createHandler } from './router'
import { registerCollectionsIpc } from './modules/collections.ipc'
import { registerJobsIpc } from './modules/jobs.ipc'
import { registerSpotifyIpc } from './modules/spotify.ipc'
import { registerVkIpc } from './modules/vk.ipc'
import { registerPlatformIpc } from './modules/platform.ipc'

export type IpcServices = {
  main: BrowserWindow
  store: Store
  spotify: Spotify
  jobs: Jobs
  spotifyBrowser: SpotifyBrowser
  vkAudio: VKAudioPlayer
  vkSession: VKSessionManager
  dataPath: string
  changed: () => void
  verifySpotifyProfile: () => Promise<void>
  rendererFilePath?: string
  devRendererUrl?: string | null
}

export type IpcHandler = ReturnType<typeof createHandler>

export function registerIpc(services: IpcServices): void {
  const handler = createHandler(services.main, {
    rendererFilePath: services.rendererFilePath,
    devRendererUrl: services.devRendererUrl,
  })

  registerCollectionsIpc(handler, services)
  registerJobsIpc(handler, services)
  registerSpotifyIpc(handler, services)
  registerVkIpc(handler, services)
  registerPlatformIpc(handler, services)
}
