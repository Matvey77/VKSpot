import { app, ipcMain, type BrowserWindow } from 'electron'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { IpcInvokeMap } from '../../shared/ipc'
import type { Result } from '../../shared/types'

type UnknownArgs<T extends unknown[]> = { [K in keyof T]: unknown }

export type HandlerOptions = {
  rendererFilePath?: string
  devRendererUrl?: string | null
}

/** Validates an explicit dev server URL so packaged builds never load arbitrary origins. */
export function resolveDevRendererUrl(
  rawUrl = process.env.ELECTRON_RENDERER_URL,
  isPackaged = app.isPackaged,
): string | null {
  if (isPackaged || !rawUrl) return null
  try {
    const parsed = new URL(rawUrl)
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      !parsed.username &&
      !parsed.password
    ) {
      return parsed.href
    }
  } catch {
    return null
  }
  return null
}

function isSameFilePath(actual: string, expected: string): boolean {
  const normalizedActual = resolve(actual)
  const normalizedExpected = resolve(expected)
  return process.platform === 'win32'
    ? normalizedActual.toLowerCase() === normalizedExpected.toLowerCase()
    : normalizedActual === normalizedExpected
}

function isAllowedSenderUrl(senderUrl: string, options: HandlerOptions): boolean {
  let parsed: URL
  try {
    parsed = new URL(senderUrl)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') {
    try {
      const clean = new URL(parsed.href)
      clean.search = ''
      clean.hash = ''
      const expectedPath =
        options.rendererFilePath ?? resolve(__dirname, '../../renderer/index.html')
      return isSameFilePath(fileURLToPath(clean), expectedPath)
    } catch {
      return false
    }
  }
  if (!app.isPackaged && options.devRendererUrl) {
    try {
      return parsed.origin === new URL(options.devRendererUrl).origin
    } catch {
      return false
    }
  }
  return false
}

export function createHandler(main: BrowserWindow, options: HandlerOptions = {}) {
  const resolvedOptions: HandlerOptions = {
    rendererFilePath: options.rendererFilePath,
    devRendererUrl:
      options.devRendererUrl === undefined ? resolveDevRendererUrl() : options.devRendererUrl,
  }
  return function handler<K extends keyof IpcInvokeMap>(
    name: K,
    fn: (
      ...args: UnknownArgs<IpcInvokeMap[K]['args']>
    ) => IpcInvokeMap[K]['result'] | Promise<IpcInvokeMap[K]['result']>,
  ): void {
    ipcMain.handle(
      'vkspot:' + name,
      async (event, ...args): Promise<Result<IpcInvokeMap[K]['result']>> => {
        if (
          main.isDestroyed() ||
          event.sender !== main.webContents ||
          !event.senderFrame ||
          event.senderFrame !== main.webContents.mainFrame ||
          !isAllowedSenderUrl(event.senderFrame.url, resolvedOptions)
        ) {
          return { ok: false, error: 'Источник команды не разрешён.' }
        }
        try {
          const typedArgs = args as UnknownArgs<IpcInvokeMap[K]['args']>
          return { ok: true, value: await fn(...typedArgs) }
        } catch (error) {
          console.error(`[IPC Error: ${name}]`, error)
          return {
            ok: false,
            error:
              error instanceof z.ZodError
                ? `Некорректные данные (${error.issues.map((i) => `${i.path.join('.') || 'корень'}: ${i.message}`).join(', ')})`
                : error instanceof Error
                  ? error.message
                  : 'Не удалось выполнить действие.',
          }
        }
      },
    )
  }
}
