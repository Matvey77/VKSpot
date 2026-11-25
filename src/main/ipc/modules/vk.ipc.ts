import { z } from 'zod'
import type { IpcHandler, IpcServices } from '../register'

export function registerVkIpc(handler: IpcHandler, services: IpcServices): void {
  const { vkAudio, vkSession } = services

  handler('playVKTrack', async (track) => {
    const schema = z.object({
      id: z.string().optional(),
      artist: z.string(),
      title: z.string(),
      duration: z.number().nonnegative().nullable().optional(),
      position: z.number().int().positive().optional(),
      volume: z.number().finite().min(0).max(100).optional(),
    })
    const parsed = schema.parse(track)
    return await vkAudio.play(parsed)
  })

  handler('pauseVKTrack', async () => await vkAudio.pause())
  handler('resumeVKTrack', async () => await vkAudio.resume())
  handler(
    'setVKVolume',
    async (volume) => await vkAudio.setVolume(z.number().finite().min(0).max(100).parse(volume)),
  )

  handler('openVK', () => vkSession.openVK())
  handler('extractVK', (options) => vkSession.extractVK(options))
  handler('cancelVKExtraction', () => vkSession.cancelVKExtraction())
  handler('clearVK', async () => {
    vkAudio.close()
    await vkSession.clearVK()
  })
}
