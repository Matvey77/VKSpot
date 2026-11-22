import type { Session } from 'electron'

const configuredSessions = new WeakSet<Session>()

/** Applies idempotent permission and download restrictions to the shared VK session. */
export function ensureVKSessionPolicy(vkSession: Session | null | undefined): void {
  if (!vkSession || configuredSessions.has(vkSession)) return
  configuredSessions.add(vkSession)
  vkSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  vkSession.setPermissionCheckHandler(() => false)
  vkSession.on('will-download', (event) => event.preventDefault())
}
