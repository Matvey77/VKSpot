import { ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type { Result } from '../../shared/model'

export function createHandler(main: BrowserWindow) {
  return function handler(name: string, fn: (...args: unknown[]) => unknown): void {
    ipcMain.handle('vkspot:' + name, async (event, ...args): Promise<Result<unknown>> => {
      if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) {
        return { ok: false, error: 'Источник команды не разрешён.' }
      }
      try {
        return { ok: true, value: await fn(...args) }
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
    })
  }
}
