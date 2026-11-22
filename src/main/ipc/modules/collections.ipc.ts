import { z } from 'zod'
import {
  collectionSchema,
  completenessSchema,
  rawTrackSchema,
  workingPatchSchema,
  type AppState,
} from '../../../shared/model'
import type { StateSync } from '../../../shared/sync'
import { exportCollectionDialog, linkFileDialog, previewImportDialog } from '../../platform/files'
import type { IpcHandler, IpcServices } from '../register'

const uuid = z.string().uuid()
const previewSchema = z.object({
  name: z.string().min(1).max(200),
  origin: z.string().max(200),
  tracks: z.array(rawTrackSchema).max(200_000),
  completeness: completenessSchema,
  restored: z.preprocess((v) => (v === null ? undefined : v), collectionSchema.optional()),
  range: z.preprocess(
    (v) => (v === null ? undefined : v),
    z
      .object({
        from: z.number().int().positive(),
        to: z.number().int().positive(),
      })
      .refine((r) => r.to >= r.from, 'Начальная позиция диапазона не может превышать конечную.')
      .optional(),
  ),
})

export function registerCollectionsIpc(handler: IpcHandler, services: IpcServices): void {
  const { main, store, spotify, jobs, spotifyBrowser, vkSession, dataPath, changed } = services

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
    if (jobs.isBusyWithCollection(collectionId))
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
    if (jobs.isBusyWithCollection(collectionId))
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
}
