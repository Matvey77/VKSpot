import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

type NativePanelState = {
  visible: boolean
  bounds: { x: number; y: number; width: number; height: number }
  page: { text: string; node: string; bridge: string; process: string }
}

async function launch(directory: string): Promise<ElectronApplication> {
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
    executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
    args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
    env,
  })
}

async function setup(directory: string) {
  const app = await launch(directory)
  await app.evaluate(async ({ session }) => {
    await session
      .fromPartition('persist:vkspot-spotify-browser')
      .protocol.handle('https', (request) => {
        const url = new URL(request.url)
        if (url.hostname !== 'open.spotify.com') return new Response('', { status: 404 })
        return new Response(
          '<!doctype html><html><body><h1>SYNTHETIC SPOTIFY PANEL</h1><p>Isolated page fixture</p></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      })
  })
  return app
}

async function cleanup(directory: string): Promise<void> {
  const target = resolve(directory)
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith('vkspot-spotify-panel-')
  )
    throw new Error('Unsafe Spotify panel cleanup target')
  await rm(target, { recursive: true, force: true })
}

async function openFromConnections(page: Awaited<ReturnType<ElectronApplication['firstWindow']>>) {
  await page.getByRole('button', { name: 'Подключения', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть страницу Spotify', exact: true }).click()
  await page.getByRole('heading', { name: 'Spotify внутри VKSpot', exact: true }).waitFor()
}

async function areaBounds(page: Awaited<ReturnType<ElectronApplication['firstWindow']>>) {
  return page.locator('.spotify-native-area').evaluate((area) => {
    const rect = area.getBoundingClientRect()
    return {
      x: Math.ceil(rect.x),
      y: Math.ceil(rect.y),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    }
  })
}

async function nativePanel(app: ElectronApplication): Promise<NativePanelState | null> {
  return app.evaluate(async ({ BrowserWindow }) => {
    type ChildView = {
      getBounds(): NativePanelState['bounds']
      getVisible(): boolean
      webContents?: {
        getURL(): string
        executeJavaScript(code: string): Promise<NativePanelState['page']>
      }
    }
    const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'VKSpot')
    if (!main) return null
    const children = Reflect.get(main.contentView, 'children') as ChildView[] | undefined
    const view = children?.find((child) =>
      child.webContents?.getURL().startsWith('https://open.spotify.com/'),
    )
    if (!view?.webContents) return null
    let page: NativePanelState['page'] = { text: '', node: '', bridge: '', process: '' }
    try {
      page = await view.webContents.executeJavaScript(
        '({ text: document.body?.innerText ?? "", node: typeof require, bridge: typeof window.vkspot, process: typeof process })',
      )
    } catch {
      /* The synthetic page may still be loading. */
    }
    return { visible: view.getVisible(), bounds: view.getBounds(), page }
  })
}

async function expectVisiblePage(
  app: ElectronApplication,
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
) {
  await expect
    .poll(async () => {
      const expectedBounds = await areaBounds(page)
      const state = await nativePanel(app)
      return state?.visible && JSON.stringify(state.bounds) === JSON.stringify(expectedBounds)
    })
    .toBe(true)
  await expect
    .poll(async () => (await nativePanel(app))?.page.text)
    .toContain('SYNTHETIC SPOTIFY PANEL')
  const expectedBounds = await areaBounds(page)
  const state = await nativePanel(app)
  expect(state).toMatchObject({
    visible: true,
    bounds: expectedBounds,
    page: { node: 'undefined', bridge: 'undefined', process: 'undefined' },
  })
}

test('Spotify native panel opens after the Radix portal mounts without resizing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-spotify-panel-'))
  const app = await setup(directory)
  try {
    const page = await app.firstWindow()
    await openFromConnections(page)
    await expectVisiblePage(app, page)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('reopening the Spotify panel restores the native view without resizing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-spotify-panel-'))
  const app = await setup(directory)
  try {
    const page = await app.firstWindow()
    await openFromConnections(page)
    await expectVisiblePage(app, page)

    await page.getByRole('button', { name: 'Вернуться к коллекции', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Spotify внутри VKSpot' })).toHaveCount(0)
    await expect.poll(async () => (await nativePanel(app))?.visible).toBe(false)

    await openFromConnections(page)
    await expectVisiblePage(app, page)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
