import { test, expect, type ElectronApplication } from '@playwright/test'
import { cleanupTestProfile, createTestProfile, launchTestApp } from './support'

type NativePanelState = {
  visible: boolean
  bounds: { x: number; y: number; width: number; height: number }
  page: { text: string; node: string; bridge: string; process: string }
}

async function setup(directory: string) {
  const app = await launchTestApp(directory)
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

const cleanup = (directory: string) =>
  cleanupTestProfile(directory, 'vkspot-spotify-panel-', 'Unsafe Spotify panel cleanup target')

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
  const directory = await createTestProfile('vkspot-spotify-panel-')
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
  const directory = await createTestProfile('vkspot-spotify-panel-')
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
