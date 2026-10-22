import { BrowserWindow } from 'electron'
import { z } from 'zod'
import {
  collectionSchema,
  completenessSchema,
  rawTrackSchema,
  settingsSchema,
  workingPatchSchema,
  type AppState,
} from '../../shared/model'
import type { StateSync } from '../../shared/sync'
import {
  executeSpotifyHelper,
  exportCollectionDialog,
  linkFileDialog,
  openExternalSafely,
  prepareLocalDialog,
  previewImportDialog,
} from '../platform/files'
import { Jobs } from '../jobs/runner'
import { configureSpotifyNetwork, configureVKNetwork, testProxy } from '../platform/network'
import { Spotify } from '../integrations/spotify/api'
import { SpotifyBrowser } from '../integrations/spotify/browser'
import { Store } from '../storage'
import { VKAudioPlayer } from '../integrations/vk/audio'
import { VKSessionManager } from '../integrations/vk/session'

import { createHandler } from './router'
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
}

export function registerIpc(services: IpcServices): void {
  const {
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
  } = services
  const handler = createHandler(main)

  handler('syncState', (cursor): StateSync => ({
    ...store.collectionSync(
      z
        .object({ session: z.string().uuid(), revision: z.number().int().nonnegative() })
        .nullable()
        .parse(cursor),
    ),
    overview: {
      jobs: store.jobSummaries(),
      settings: store.settings(),
      spotify: { connected: spotify.connected(), name: store.value('spotifyName', '') },
      vk: vkSession.getStatus(),
      spotifyBrowser: spotifyBrowser.snapshot(),
      dataPath,
    },
  }))
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
    const collectionId = uuid.parse(id)
    if (
      store
        .jobSummaries()
        .some(
          (job) =>
            job.collectionId === collectionId &&
            (job.state === 'running' || job.state === 'pausing'),
        )
    )
      throw new Error(
        'Перед удалением коллекции приостановите её задание и дождитесь завершения текущего запроса.',
      )
    store.deleteCollection(collectionId)
    changed()
  })

  handler('reorderCollections', (ids) => {
    store.reorderCollections(z.array(uuid).parse(ids))
    changed()
  })

  handler('repairCollection', (id, preview) => {
    const collectionId = uuid.parse(id)
    if (
      store
        .jobSummaries()
        .some(
          (job) =>
            job.collectionId === collectionId &&
            (job.state === 'running' || job.state === 'pausing'),
        )
    )
      throw new Error(
        'Перед синхронизацией приостановите задание этой коллекции и дождитесь завершения текущего запроса.',
      )
    const result = store.repairCollection(collectionId, previewSchema.parse(preview))
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
      duration: z.number().nonnegative().nullable().optional(),
      position: z.number().int().positive().optional(),
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
  handler('clearVK', async () => {
    vkAudio.close()
    await vkSession.clearVK()
  })

  handler('prepareLocal', (id) => prepareLocalDialog(main, store, id))
  handler('helper', (action) => executeSpotifyHelper(action))
}
