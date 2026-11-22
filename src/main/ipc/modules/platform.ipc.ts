import { z } from 'zod'
import { proxySchema, settingsSchema } from '../../../shared/model'
import { executeSpotifyHelper, openExternalSafely, prepareLocalDialog } from '../../platform/files'
import { configureSpotifyNetwork, configureVKNetwork, testProxy } from '../../platform/network'
import type { IpcHandler, IpcServices } from '../register'

export function registerPlatformIpc(handler: IpcHandler, services: IpcServices): void {
  const { main, store, spotify, jobs, changed, verifySpotifyProfile } = services

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

  handler('openExternal', openExternalSafely)

  handler('testProxy', (proxyUrl, target) =>
    testProxy(proxySchema.parse(proxyUrl), z.enum(['spotify', 'vk']).optional().parse(target)),
  )

  handler('prepareLocal', (id) => prepareLocalDialog(main, store, id))
  handler('helper', (action) => executeSpotifyHelper(action))
}
