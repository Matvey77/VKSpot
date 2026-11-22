import { z } from 'zod'
import type { IpcHandler, IpcServices } from '../register'

const uuid = z.string().uuid()

export function registerJobsIpc(handler: IpcHandler, services: IpcServices): void {
  const { store, jobs, changed } = services

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
    const jobId = uuid.parse(id)
    if (jobs.isActive(jobId)) {
      throw new Error('Нельзя архивировать активное или приостанавливаемое задание.')
    }
    store.archiveJob(jobId)
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
}
