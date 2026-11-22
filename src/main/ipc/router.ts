import { ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type { IpcInvokeMap } from '../../shared/ipc'
import type { Result } from '../../shared/types'

type UnknownArgs<T extends unknown[]> = { [K in keyof T]: unknown }

export function createHandler(main: BrowserWindow) {
  return function handler<K extends keyof IpcInvokeMap>(
    name: K,
    fn: (
      ...args: UnknownArgs<IpcInvokeMap[K]['args']>
    ) => IpcInvokeMap[K]['result'] | Promise<IpcInvokeMap[K]['result']>,
  ): void {
    ipcMain.handle(
      'vkspot:' + name,
      async (event, ...args): Promise<Result<IpcInvokeMap[K]['result']>> => {
        if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) {
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
