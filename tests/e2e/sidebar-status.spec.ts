import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { modernVKPage } from '../fixtures/vk-pages'
import {
  connectMockSpotifyApi,
  getAppState,
  importSyntheticCollection,
  installSpotifyBrowserMock,
  updateAppSettings,
} from './mocks'
import { setWindowContentSize, withTestApp } from './support'

const sections = ['Обзор', 'Коллекции', 'Подключения', 'Задания', 'Настройки']
const viewports = [
  { width: 940, height: 640 },
  { width: 1000, height: 760 },
  { width: 1440, height: 920 },
]

async function mockVKPage(app: ElectronApplication, library: string): Promise<void> {
  await app.evaluate(async ({ session }, library) => {
    Reflect.set(globalThis, '__sidebarVKLogin', false)
    await session.fromPartition('persist:vkspot-vk').protocol.handle('https', (request) => {
      const url = new URL(request.url)
      if (url.hostname !== 'vk.com') return new Response('', { status: 404 })
      const html = Reflect.get(globalThis, '__sidebarVKLogin')
        ? '<!doctype html><form action="/login/auth/signin"><input type="password" /></form>'
        : library
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    })
  }, library)
}

test('sidebar service and task status stays visible across sections and compact viewports', async () => {
  await withTestApp('vkspot-sidebar-', async ({ app }) => {
    const page = await app.firstWindow()
    await mkdir(join(process.cwd(), '.local/evidence/e2e'), { recursive: true })
    const sidebar = page.locator('.sidebar-status')
    await expect(sidebar).toBeVisible()
    await expect(page.getByRole('button', { name: /^Spotify: / })).toBeVisible()
    await expect(page.getByRole('button', { name: /^VK: / })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Последнее задание: заданий пока нет', exact: true }),
    ).toBeVisible()
    await expect(sidebar.locator('progress')).toHaveCount(0)
    await expect(page.locator('header.topbar')).toHaveCount(0)
    await expect(page.locator('.sidebar-footer')).toHaveCount(0)
    await expect(page.getByText('На твоём компьютере', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Без подписки на VKSpot', { exact: true })).toHaveCount(0)

    await connectMockSpotifyApi(app, {
      userId: 'synthetic-sidebar-user',
      displayName: 'Synthetic listener',
    })
    await expect(
      page.getByRole('button', { name: 'Spotify: Synthetic listener', exact: true }),
    ).toBeVisible()

    for (const viewport of [viewports[2], viewports[0]]) {
      await setWindowContentSize(app, viewport.width, viewport.height)
      await page.getByRole('button', { name: 'Обзор', exact: true }).click()
      await page.screenshot({
        path: `.local/evidence/e2e/sidebar-status-start-${viewport.width}x${viewport.height}.png`,
        animations: 'disabled',
      })
    }

    for (const viewport of viewports) {
      await setWindowContentSize(app, viewport.width, viewport.height)
      for (const section of sections) {
        await page.getByRole('button', { name: section, exact: true }).click()
        await expect(sidebar).toBeVisible()
        await expect(page.getByRole('button', { name: /^Spotify: / })).toBeVisible()
        await expect(page.getByRole('button', { name: /^VK: / })).toBeVisible()
        const bounds = await sidebar.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }
        })
        expect(bounds.width).toBeGreaterThan(0)
        expect(bounds.top).toBeGreaterThanOrEqual(-1)
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1)
        expect(bounds.left).toBeGreaterThanOrEqual(-1)
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1)
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1)
        await expect(sidebar.locator('progress')).toHaveCount(0)
      }
    }
  })
})

test('latest sidebar task follows createdAt and reports live progress across views', async () => {
  await withTestApp('vkspot-sidebar-', async (ctx) => {
    const initialPage = await ctx.app.firstWindow()
    const collection = await importSyntheticCollection(initialPage, {
      name: 'Sidebar progress fixture',
      tracks: [1, 2, 3].map((number) => ({
        artist: 'Sidebar Artist',
        title: `Song ${number}`,
        duration: 180,
      })),
    })
    const imported = {
      collectionId: collection.id,
      rowIds: collection.rows.map((row) => row.id),
    }
    await ctx.close()

    const older = {
      id: randomUUID(),
      collectionId: imported.collectionId,
      kind: 'search' as const,
      state: 'complete' as const,
      cursor: 3,
      total: 3,
      message: 'Older synthetic job',
      rowIds: imported.rowIds,
      backgroundSearch: true,
      autoResume: false,
      searchProvider: 'browser' as const,
      createdAt: new Date(Date.now() - 120000).toISOString(),
      updatedAt: new Date(Date.now() + 60000).toISOString(),
    }
    const latest = {
      id: randomUUID(),
      collectionId: imported.collectionId,
      kind: 'search' as const,
      state: 'paused' as const,
      cursor: 1,
      total: 3,
      message: 'Synthetic pause at saved progress',
      rowIds: imported.rowIds,
      backgroundSearch: true,
      autoResume: false,
      searchProvider: 'browser' as const,
      createdAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date(Date.now() - 50000).toISOString(),
    }
    const database = new DatabaseSync(join(ctx.directory, 'collection.db'))
    try {
      const insert = database.prepare('INSERT INTO jobs(id,payload) VALUES(?,?)')
      insert.run(latest.id, JSON.stringify(latest))
      insert.run(older.id, JSON.stringify(older))
    } finally {
      database.close()
    }

    const app = await ctx.relaunch()
    await installSpotifyBrowserMock(app, {
      trackTitle: 'Synthetic result',
      artistName: 'Sidebar Artist',
      albumName: 'Synthetic album',
    })
    const page = await app.firstWindow()
    const state = await getAppState(page)
    expect(state.jobs[0].id).toBe(older.id)
    expect(Date.parse(state.jobs.find((job) => job.id === older.id)!.updatedAt)).toBeGreaterThan(
      Date.parse(latest.createdAt),
    )

    const statusButton = page.locator('.sidebar-job')
    const progress = page.getByRole('progressbar', { name: 'Прогресс последнего задания' })
    const visitViews = async (stateLabel: string, cursor: number) => {
      for (const section of sections) {
        await page.getByRole('button', { name: section, exact: true }).click()
        await expect(statusButton).toHaveAttribute(
          'aria-label',
          `Последнее задание: Поиск Spotify, ${stateLabel}, ${cursor} из 3`,
        )
        await expect(progress).toHaveAttribute('value', String(cursor))
        await expect(progress).toHaveAttribute('max', '3')
        await expect(statusButton).toContainText(`${cursor} / 3`)
        await expect(statusButton).toContainText(`${Math.round((cursor / 3) * 100)}%`)
      }
    }
    await visitViews('Пауза', 1)

    await setWindowContentSize(app, 1000, 760)
    await updateAppSettings(page, { theme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Обзор', exact: true }).click()
    await expect(statusButton).toHaveAttribute(
      'aria-label',
      'Последнее задание: Поиск Spotify, Пауза, 1 из 3',
    )
    await mkdir(join(process.cwd(), '.local/evidence/e2e'), { recursive: true })
    await page.screenshot({
      path: '.local/evidence/e2e/sidebar-status-paused-1000x760-dark.png',
      animations: 'disabled',
    })

    await app.evaluate(() => {
      Reflect.set(globalThis, '__holdBrowserSearch', true)
      Reflect.set(globalThis, '__browserChallenge', true)
    })
    const resume = await page.evaluate((id) => window.vkspot.controlJob(id, 'resume'), latest.id)
    expect(resume.ok).toBe(true)
    await expect
      .poll(async () => {
        const current = await page.evaluate(() => window.vkspot.state())
        return current.ok && current.value.jobs.find((job) => job.id === latest.id)?.state
      })
      .toBe('running')
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseBrowserSearch')))
      .toBe('function')
    await visitViews('В работе', 1)

    await app.evaluate(() => {
      const release = Reflect.get(globalThis, '__releaseBrowserSearch') as (() => void) | undefined
      if (!release) throw new Error('Synthetic browser search was not waiting')
      release()
    })
    await expect
      .poll(async () => {
        const current = await page.evaluate(() => window.vkspot.state())
        return current.ok && current.value.jobs.find((job) => job.id === latest.id)?.state
      })
      .toBe('paused')
    await visitViews('Пауза', 1)

    await app.evaluate(() => {
      Reflect.set(globalThis, '__holdBrowserSearch', false)
      Reflect.set(globalThis, '__browserChallenge', false)
    })
    const retry = await page.evaluate((id) => window.vkspot.controlJob(id, 'resume'), latest.id)
    expect(retry.ok).toBe(true)
    await expect
      .poll(
        async () => {
          const current = await page.evaluate(() => window.vkspot.state())
          return current.ok && current.value.jobs.find((job) => job.id === latest.id)?.state
        },
        { timeout: 20000 },
      )
      .toBe('complete')
    await visitViews('Готово', 3)

    const finished = await getAppState(page)
    expect(finished.jobs.find((job) => job.id === older.id)?.state).toBe('complete')
    expect(finished.jobs.find((job) => job.id === latest.id)).toMatchObject({
      state: 'complete',
      cursor: 3,
      total: 3,
    })
  })
})

test('VK sidebar status follows synthetic library, window close and session reset', async () => {
  test.setTimeout(45000)
  await withTestApp('vkspot-sidebar-', async ({ app }) => {
    const page = await app.firstWindow()
    const library = modernVKPage({ total: 3 })
    await mockVKPage(app, library)
    const initial = await getAppState(page)
    expect(initial.vk?.state).toBe('unknown')
    await expect(page.getByRole('button', { name: 'VK: Не проверен', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'VK: Не проверен', exact: true }).click()
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.vk?.state
      })
      .toBe('connected')
    const connected = await getAppState(page)
    const checkedAt = connected.vk?.checkedAt
    expect(checkedAt).toBeTruthy()
    await expect(page.getByRole('button', { name: 'VK: Подключён', exact: true })).toBeVisible()

    await app.evaluate(({ BrowserWindow }) => {
      const vkWindow = BrowserWindow.getAllWindows().find(
        (window) => window.getTitle() === 'VKSpot — VK Музыка',
      )
      if (!vkWindow) throw new Error('Synthetic VK window was not opened')
      vkWindow.close()
    })
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) => window.getTitle() === 'VKSpot — VK Музыка',
          ),
        ),
      )
      .toBe(false)
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok
          ? { state: state.value.vk?.state, checkedAt: state.value.vk?.checkedAt }
          : null
      })
      .toEqual({ state: 'connected', checkedAt })

    await page.getByRole('button', { name: 'VK: Подключён', exact: true }).click()
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some(
              (contents) => contents.getURL() === 'https://vk.com/audio' && !contents.isLoading(),
            ),
        ),
      )
      .toBe(true)
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.vk?.state
      })
      .toBe('connected')

    const beforeReset = await getAppState(page)
    await app.evaluate(() => Reflect.set(globalThis, '__sidebarVKLogin', true))
    await page.evaluate(() => {
      Reflect.set(window, '__sidebarClearPromise', window.vkspot.clearVK())
    })
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.vk?.state
      })
      .not.toBe('connected')
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.vk?.state
      })
      .toBe('sign-in')
    const clearResult = await page.evaluate(
      async () => await Reflect.get(window, '__sidebarClearPromise'),
    )
    if (!clearResult.ok) throw new Error(clearResult.error)
    const signedOut = await getAppState(page)
    expect(signedOut.vk?.state).toBe('sign-in')
    expect(signedOut.vk?.state).not.toBe('connected')
    expect(Date.parse(signedOut.vk?.checkedAt ?? '')).toBeGreaterThan(
      Date.parse(beforeReset.vk?.checkedAt ?? ''),
    )
    await expect(page.getByRole('button', { name: 'VK: Нужен вход', exact: true })).toBeVisible()
  })
})
