import { z } from 'zod'
import type { IpcHandler, IpcServices } from '../register'

export function registerSpotifyIpc(handler: IpcHandler, services: IpcServices): void {
  const { main, store, spotify, jobs, spotifyBrowser, changed, verifySpotifyProfile } = services

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
      const x = Math.min(parsed.x, Math.max(0, width - 100))
      const y = Math.min(parsed.y, Math.max(0, height - 100))
      const clamped = {
        x,
        y,
        width: Math.min(parsed.width, Math.max(100, width - x)),
        height: Math.min(parsed.height, Math.max(100, height - y)),
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
}
