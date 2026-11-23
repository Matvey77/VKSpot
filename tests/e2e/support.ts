import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

export type TestAppContext = {
  readonly directory: string
  readonly app: ElectronApplication
  close: () => Promise<void>
  relaunch: () => Promise<ElectronApplication>
}

export function createTestProfile(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function cleanupTestProfile(
  directory: string,
  prefix: string,
  message = 'Unsafe test cleanup target',
): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error(message)
  await rm(target, { recursive: true, force: true })
}

export async function launchTestApp(directory: string): Promise<ElectronApplication> {
  const executablePath = process.env.VKSPOT_TEST_EXECUTABLE
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    VKSPOT_DATA_DIR: directory,
    VKSPOT_BACKGROUND_TEST: '1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    chromiumSandbox: true,
    args: executablePath ? [] : ['.'],
    env,
  })
}

export async function withTestApp<T>(
  prefix: string,
  callback: (context: TestAppContext) => Promise<T>,
): Promise<T> {
  const directory = await createTestProfile(prefix)
  let current: ElectronApplication | null = await launchTestApp(directory)
  const context: TestAppContext = {
    directory,
    get app() {
      if (!current) throw new Error('Test Electron application is currently closed')
      return current
    },
    async close() {
      if (!current) return
      const target = current
      current = null
      await target.close()
    },
    async relaunch() {
      if (current) {
        const previous = current
        current = null
        await previous.close()
      }
      current = await launchTestApp(directory)
      return current
    },
  }
  try {
    return await callback(context)
  } finally {
    try {
      if (current) {
        const target = current
        current = null
        await target.close()
      }
    } finally {
      await cleanupTestProfile(directory, prefix)
    }
  }
}

export async function setWindowContentSize(
  app: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const target =
        BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().startsWith('file:')) ??
        BrowserWindow.getAllWindows()[0]
      if (!target) throw new Error('No BrowserWindow available to resize')
      target.setContentSize(size.width, size.height)
    },
    { width, height },
  )
  const page =
    app.windows().find((win) => win.url().startsWith('file:')) ?? (await app.firstWindow())
  await page.waitForFunction(
    (size) => window.innerWidth === size.width && window.innerHeight === size.height,
    { width, height },
  )
}
