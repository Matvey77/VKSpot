import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { modernVKPage } from '../fixtures/vk-pages'

const sections = ['Обзор', 'Коллекции', 'Подключения', 'Задания', 'Настройки']
const viewports = [
  { width: 940, height: 640 },
  { width: 1000, height: 760 },
  { width: 1440, height: 920 },
]

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

async function cleanup(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('vkspot-sidebar-'))
    throw new Error('Unsafe sidebar test cleanup target')
  await rm(target, { recursive: true, force: true })
}

async function mockBrowserSearch(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ session }) => {
    Reflect.set(globalThis, '__sidebarChallenge', false)
    Reflect.set(globalThis, '__sidebarBlockSearch', false)
    Reflect.set(globalThis, '__sidebarReleaseSearch', undefined)
    await session
      .fromPartition('persist:vkspot-spotify-browser')
      .protocol.handle('https', async (request) => {
        const url = new URL(request.url)
        if (url.hostname !== 'open.spotify.com') return new Response('', { status: 404 })
        if (Reflect.get(globalThis, '__sidebarBlockSearch') && url.pathname.startsWith('/search/'))
          await new Promise<void>((resolve) =>
            Reflect.set(globalThis, '__sidebarReleaseSearch', resolve),
          )
        if (Reflect.get(globalThis, '__sidebarChallenge'))
          return new Response('<body><main>Verify you are human</main></body>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        const query = decodeURIComponent(url.pathname.split('/')[2] ?? '')
        return new Response(
          '<!doctype html><html><body><main><div data-testid="tracklist-row"><div role="gridcell"><a href="/track/' +
            'a'.repeat(22) +
            '">Synthetic result</a><a href="/artist/' +
            'b'.repeat(22) +
            '">Sidebar Artist</a></div><div role="gridcell"><a href="/album/' +
            'c'.repeat(22) +
            '">Synthetic album</a><span>3:00</span></div></div><p>' +
            query +
            '</p></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      })
  })
}

async function connectSyntheticSpotify(
  app: ElectronApplication,
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
): Promise<void> {
  await app.evaluate(async ({ session, shell }) => {
    await session.fromPartition('vkspot-spotify-api').protocol.handle('https', (request) => {
      const url = new URL(request.url)
      if (url.hostname === 'accounts.spotify.com' && url.pathname === '/api/token')
        return Response.json({
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-refresh',
          expires_in: 3600,
        })
      if (url.hostname === 'api.spotify.com' && url.pathname === '/v1/me')
        return Response.json({ id: 'synthetic-sidebar-user', display_name: 'Synthetic listener' })
      return new Response('', { status: 404 })
    })
    shell.openExternal = async (address) => {
      const url = new URL(address)
      await fetch(
        'http://127.0.0.1:43823/callback?' +
          new URLSearchParams({ code: 'synthetic-code', state: url.searchParams.get('state')! }),
      )
    }
  })
  const connected = await page.evaluate(async () => {
    const state = await window.vkspot.state()
    if (!state.ok) throw new Error(state.error)
    const saved = await window.vkspot.saveSettings({
      ...state.value.settings,
      clientId: 'a'.repeat(32),
    })
    if (!saved.ok) throw new Error(saved.error)
    return window.vkspot.connectSpotify()
  })
  if (!connected.ok) throw new Error(connected.error)
}

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
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-sidebar-'))
  const app = await launch(directory)
  try {
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

    await connectSyntheticSpotify(app, page)
    await expect(
      page.getByRole('button', { name: 'Spotify: Synthetic listener', exact: true }),
    ).toBeVisible()

    for (const viewport of [viewports[2], viewports[0]]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height)
      }, viewport)
      await page.waitForFunction(
        (size) => window.innerWidth === size.width && window.innerHeight === size.height,
        viewport,
      )
      await page.getByRole('button', { name: 'Обзор', exact: true }).click()
      await page.screenshot({
        path: `.local/evidence/e2e/sidebar-status-start-${viewport.width}x${viewport.height}.png`,
        animations: 'disabled',
      })
    }

    for (const viewport of viewports) {
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height)
      }, viewport)
      await page.waitForFunction(
        (size) => window.innerWidth === size.width && window.innerHeight === size.height,
        viewport,
      )
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
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('latest sidebar task follows createdAt and reports live progress across views', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-sidebar-'))
  let app: ElectronApplication | null = await launch(directory)
  try {
    const initialPage = await app.firstWindow()
    const imported = await initialPage.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Sidebar progress fixture',
        origin: 'Synthetic test',
        completeness: { expected: 3, status: 'verified-count', message: 'Test only' },
        tracks: [1, 2, 3].map((number) => ({
          artist: 'Sidebar Artist',
          title: `Song ${number}`,
          duration: 180,
        })),
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections.find((item) => item.id === result.value)!
      return { collectionId: collection.id, rowIds: collection.rows.map((row) => row.id) }
    })
    await app.close()
    app = null

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
    const database = new DatabaseSync(join(directory, 'collection.db'))
    const insert = database.prepare('INSERT INTO jobs(id,payload) VALUES(?,?)')
    insert.run(latest.id, JSON.stringify(latest))
    insert.run(older.id, JSON.stringify(older))
    database.close()

    app = await launch(directory)
    await mockBrowserSearch(app)
    const page = await app.firstWindow()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.jobs[0].id).toBe(older.id)
    expect(
      Date.parse(state.value.jobs.find((job) => job.id === older.id)!.updatedAt),
    ).toBeGreaterThan(Date.parse(latest.createdAt))

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

    const compact = { width: 1000, height: 760 }
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height)
    }, compact)
    await page.waitForFunction(
      (size) => window.innerWidth === size.width && window.innerHeight === size.height,
      compact,
    )
    const preferences = await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      return window.vkspot.saveSettings({ ...state.value.settings, theme: 'dark' })
    })
    if (!preferences.ok) throw new Error(preferences.error)
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
      Reflect.set(globalThis, '__sidebarBlockSearch', true)
      Reflect.set(globalThis, '__sidebarChallenge', true)
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
      .poll(() => app!.evaluate(() => typeof Reflect.get(globalThis, '__sidebarReleaseSearch')))
      .toBe('function')
    await visitViews('В работе', 1)

    await app.evaluate(() => {
      const release = Reflect.get(globalThis, '__sidebarReleaseSearch') as (() => void) | undefined
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
      Reflect.set(globalThis, '__sidebarBlockSearch', false)
      Reflect.set(globalThis, '__sidebarChallenge', false)
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

    const finished = await page.evaluate(() => window.vkspot.state())
    if (!finished.ok) throw new Error(finished.error)
    expect(finished.value.jobs.find((job) => job.id === older.id)?.state).toBe('complete')
    expect(finished.value.jobs.find((job) => job.id === latest.id)).toMatchObject({
      state: 'complete',
      cursor: 3,
      total: 3,
    })
  } finally {
    if (app) await app.close()
    await cleanup(directory)
  }
})

test('VK sidebar status follows synthetic library, window close and session reset', async () => {
  test.setTimeout(45000)
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-sidebar-'))
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    const library = modernVKPage({ total: 3 })
    await mockVKPage(app, library)
    const initial = await page.evaluate(() => window.vkspot.state())
    if (!initial.ok) throw new Error(initial.error)
    expect(initial.value.vk?.state).toBe('unknown')
    await expect(page.getByRole('button', { name: 'VK: Не проверен', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'VK: Не проверен', exact: true }).click()
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.vk?.state
      })
      .toBe('connected')
    const connected = await page.evaluate(() => window.vkspot.state())
    if (!connected.ok) throw new Error(connected.error)
    const checkedAt = connected.value.vk?.checkedAt
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

    const beforeReset = await page.evaluate(() => window.vkspot.state())
    if (!beforeReset.ok) throw new Error(beforeReset.error)
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
    const signedOut = await page.evaluate(() => window.vkspot.state())
    if (!signedOut.ok) throw new Error(signedOut.error)
    expect(signedOut.value.vk?.state).toBe('sign-in')
    expect(signedOut.value.vk?.state).not.toBe('connected')
    expect(Date.parse(signedOut.value.vk?.checkedAt ?? '')).toBeGreaterThan(
      Date.parse(beforeReset.value.vk?.checkedAt ?? ''),
    )
    await expect(page.getByRole('button', { name: 'VK: Нужен вход', exact: true })).toBeVisible()
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
