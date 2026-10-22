import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { openLibrary } from './navigation'

async function launch(directory: string) {
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
async function mockPages(app: ElectronApplication) {
  await app.evaluate(async ({ session }) => {
    Reflect.set(globalThis, '__browserQueries', [])
    const network = session.fromPartition('persist:vkspot-spotify-browser')
    // protocol.handle bypasses Chromium's network header events. Deliver the
    // equivalent event explicitly for the synthetic 429 response below.
    Object.defineProperty(network.webRequest, 'onHeadersReceived', {
      value: (_filter: unknown, listener: unknown) =>
        Reflect.set(globalThis, '__browserHeaders', listener),
    })
    await network.protocol.handle('https', async (request) => {
      const url = new URL(request.url)
      const query = decodeURIComponent(url.pathname.split('/')[2] ?? '')
      const calls = Reflect.get(globalThis, '__browserQueries') as string[]
      calls.push(query)
      if (Reflect.get(globalThis, '__holdBrowserSearch'))
        await new Promise<void>((resolve) =>
          Reflect.set(globalThis, '__releaseBrowserSearch', resolve),
        )
      const times = (Reflect.get(globalThis, '__browserCallTimes') ?? []) as number[]
      times.push(Date.now())
      Reflect.set(globalThis, '__browserCallTimes', times)
      if (Reflect.get(globalThis, '__browserLimited') && calls.length === 1) {
        Reflect.get(globalThis, '__browserHeaders')?.(
          { resourceType: 'mainFrame', statusCode: 429, responseHeaders: { 'Retry-After': ['2'] } },
          () => {},
        )
        return new Response('<body>Too many requests</body>', {
          status: 429,
          headers: { 'Retry-After': '2', 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (Reflect.get(globalThis, '__browserChallenge'))
        return new Response('<body><main>Verify you are human</main></body>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      const rows =
        query.includes('Missing') || Reflect.get(globalThis, '__browserEmpty')
          ? '<h1>Ничего не найдено</h1>'
          : `
        <div data-testid="tracklist-row"><div role="gridcell"><a href="/track/${'a'.repeat(22)}">${Reflect.get(globalThis, '__browserUpdated') ? 'Updated Song' : 'Song'}</a><a href="/artist/${'b'.repeat(22)}">Artist</a></div><div role="gridcell"><a href="/album/${'c'.repeat(22)}">Album</a><span>3:00</span></div></div>`
      return new Response(
        '<!doctype html><html><body><iframe src="about:blank#captcha" style="display:none"></iframe><main>' +
          rows +
          '</main></body></html>',
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      )
    })
  })
}
async function cleanup(directory: string) {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-browser-')
  )
    throw new Error('Unsafe cleanup target')
  await rm(directory, { recursive: true, force: true })
}

test('inspector searches Spotify again after cached results and displays progress, empty results and errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    const page = await app.firstWindow()
    const original = await page.evaluate(async () => {
      const imported = await window.vkspot.importCollection({
        name: 'Manual search fixture',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections[0]
      await window.vkspot.startSearch(collection.id, [collection.rows[0].id], true)
      return collection
    })
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.jobs[0]?.state
      })
      .toBe('complete')
    await openLibrary(page)
    await page.getByRole('cell', { name: 'Song Artist', exact: true }).click()
    const inspector = page.locator('.inspector')
    await expect(inspector.locator('.candidate strong')).toHaveText('Song')
    await app.evaluate(() => {
      Reflect.set(globalThis, '__browserUpdated', true)
      Reflect.set(globalThis, '__holdBrowserSearch', true)
    })
    await inspector.getByRole('button', { name: 'Найти в Spotify', exact: true }).click()
    await expect(
      inspector.getByRole('button', { name: 'Поиск в Spotify…', exact: true }),
    ).toBeDisabled()
    await expect(inspector.getByRole('status')).toContainText('Запрашиваем актуальные варианты')
    await expect
      .poll(() => app.evaluate(() => Reflect.get(globalThis, '__browserQueries').length))
      .toBe(2)
    await app.evaluate(() => {
      Reflect.set(globalThis, '__holdBrowserSearch', false)
      Reflect.get(globalThis, '__releaseBrowserSearch')()
    })
    await expect(inspector.locator('.candidate strong')).toHaveText('Updated Song')
    await expect(inspector.getByRole('status')).toHaveText('Поиск завершён. Найдено вариантов: 1.')
    await page.screenshot({ path: '.local/evidence/e2e/inspector-manual-search.png' })

    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', true))
    await inspector.getByRole('button', { name: 'Найти в Spotify', exact: true }).click()
    await expect(inspector.getByRole('status')).toContainText('Spotify требует вход или проверку')
    await expect(inspector.locator('.candidate strong')).toHaveText('Updated Song')
    await app.evaluate(() => {
      Reflect.set(globalThis, '__browserChallenge', false)
      Reflect.set(globalThis, '__browserEmpty', true)
    })
    await inspector.getByRole('button', { name: 'Найти в Spotify', exact: true }).click()
    await expect(inspector.getByRole('status')).toHaveText('Поиск завершён. Найдено вариантов: 0.')
    await expect(inspector.locator('.candidate')).toHaveCount(0)
    expect(await app.evaluate(() => Reflect.get(globalThis, '__browserQueries'))).toEqual(
      Array(4).fill('Artist Song'),
    )
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.value.collections[0].rows[0].source).toEqual(original.rows[0].source)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('browser search needs no API login, caches repeats, keeps source and offers the next review step', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    const page = await app.firstWindow()
    await expect(
      page.getByRole('heading', { name: 'Твоя музыка из VK — в Spotify', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.next-action')).toHaveCount(1)
    await expect(page.locator('.guide-canvas')).toHaveCount(0)
    await page.screenshot({ path: '.local/evidence/e2e/start-simple.png' })
    const original = await page.evaluate(async () => {
      const imported = await window.vkspot.importCollection({
        name: 'Browser fixture',
        origin: 'Synthetic',
        completeness: { expected: 3, status: 'verified-count', message: 'Test only' },
        tracks: ['Song', 'Song', 'Missing'].map((title) => ({
          artist: 'Artist',
          title,
          duration: 180,
        })),
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      await window.vkspot.saveSettings({ ...state.value.settings, searchDelayMs: 1000 })
      return state.value.collections[0]
    })
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => window.vkspot.state())
          return state.ok && state.value.jobs[0]?.state
        },
        { timeout: 20000 },
      )
      .toBe('complete')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.spotify.connected).toBe(false)
    expect(state.value.jobs[0].searchProvider).toBe('browser')
    expect(state.value.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.value.collections[0].rows.map((r) => r.source)).toEqual(
      original.rows.map((r) => r.source),
    )
    expect(state.value.collections[0].rows[0].working.candidates[0]).toMatchObject({
      title: 'Song',
      artists: ['Artist'],
      duration: 180,
    })
    expect(state.value.collections[0].rows[2].working).toMatchObject({
      candidates: [],
      searchedQuery: 'Artist Missing',
    })
    expect(await app.evaluate(() => Reflect.get(globalThis, '__browserQueries'))).toEqual([
      'Artist Song',
      'Artist Missing',
    ])
    const nextStep = page.getByRole('button', { name: 'Проверить совпадения', exact: true })
    if (await nextStep.isVisible().catch(() => false)) {
      await nextStep.click()
    } else {
      await page.getByRole('combobox', { name: 'Результат поиска' }).selectOption('exact')
      await page.getByRole('button', { name: /Выделить выборку/ }).click()
    }
    await expect(
      page.getByRole('button', { name: 'Подтвердить выбранные (2)', exact: true }),
    ).toBeEnabled()
    await page.screenshot({ path: '.local/evidence/e2e/browser-results.png' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: '.local/evidence/e2e/browser-results-compact.png' })
    await page.evaluate(async () => {
      const s = await window.vkspot.state()
      if (s.ok) await window.vkspot.saveSettings({ ...s.value.settings, theme: 'dark' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({
      path: '.local/evidence/e2e/browser-results-compact-dark.png',
      animations: 'disabled',
    })
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('browser Retry-After resumes automatically without using the API or sending an early request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserLimited', true))
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Browser quota fixture',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
      } as never),
    )
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(() => window.vkspot.state())
          return s.ok && s.value.jobs[0]?.state
        },
        { timeout: 15000 },
      )
      .toBe('complete')
    const calls = await app.evaluate(
      () => Reflect.get(globalThis, '__browserCallTimes') as number[],
    )
    expect(calls).toHaveLength(2)
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(2000)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('page challenge keeps the current track pending and recovers inside the app', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', true))
    const page = await app.firstWindow()
    await page.evaluate(async () => {
      await window.vkspot.importCollection({
        name: 'Challenge fixture',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
      } as never)
    })
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('paused')
    let state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.jobs[0].cursor).toBe(0)
    expect(state.value.collections[0].rows[0].working.searchedQuery).toBeNull()
    await page
      .locator('.context-help')
      .getByRole('button', { name: 'Открыть Spotify здесь' })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const native = await app.evaluate(async ({ webContents }) => {
      const contents = webContents
        .getAllWebContents()
        .find((c) => c.getURL().startsWith('https://open.spotify.com/'))!
      return await contents.executeJavaScript(
        '({ node: typeof require, bridge: typeof window.vkspot, process: typeof process })',
      )
    })
    expect(native).toEqual({ node: 'undefined', bridge: 'undefined', process: 'undefined' })
    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', false))
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Продолжить поиск', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[0].working.candidates).toHaveLength(1)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('a stale Spotify panel owner cannot hide the newer owner view', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    const page = await app.firstWindow()
    const ownerA = crypto.randomUUID()
    const ownerB = crypto.randomUUID()
    const bounds = { x: 0, y: 0, width: 320, height: 240 }
    const visible = () =>
      app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows()[0]
        const browser = main.contentView.children.find((child) => 'webContents' in child)
        return browser?.getVisible() ?? false
      })

    const shownA = await page.evaluate(
      ({ bounds, owner }) => window.vkspot.showSpotifyBrowser(bounds, owner),
      { bounds, owner: ownerA },
    )
    expect(shownA.ok).toBe(true)
    await expect.poll(visible).toBe(true)

    const shownB = await page.evaluate(
      ({ bounds, owner }) => window.vkspot.showSpotifyBrowser(bounds, owner),
      { bounds, owner: ownerB },
    )
    expect(shownB.ok).toBe(true)
    await expect.poll(visible).toBe(true)

    const staleHide = await page.evaluate(
      (owner) => window.vkspot.showSpotifyBrowser(null, owner),
      ownerA,
    )
    expect(staleHide.ok).toBe(true)
    await expect.poll(visible).toBe(true)

    const currentHide = await page.evaluate(
      (owner) => window.vkspot.showSpotifyBrowser(null, owner),
      ownerB,
    )
    expect(currentHide.ok).toBe(true)
    await expect.poll(visible).toBe(false)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('continuing a challenged job from its Jobs card resumes that collection only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await mockPages(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', true))
    const page = await app.firstWindow()
    const createSearch = (name: string, title: string) =>
      page.evaluate(
        async ({ name, title }) => {
          const imported = await window.vkspot.importCollection({
            name,
            origin: 'Synthetic',
            completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
            tracks: [{ artist: 'Artist', title, duration: 180 }],
          } as never)
          if (!imported.ok) throw new Error(imported.error)
          const state = await window.vkspot.state()
          if (!state.ok) throw new Error(state.error)
          const collection = state.value.collections.find((item) => item.id === imported.value)!
          const started = await window.vkspot.startSearch(
            collection.id,
            [collection.rows[0].id],
            true,
          )
          if (!started.ok) throw new Error(started.error)
          return { collectionId: collection.id, jobId: started.value }
        },
        { name, title },
      )

    const jobA = await createSearch('Browser owner A', 'Song A')
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.jobs.find((job) => job.id === jobA.jobId)?.state
      })
      .toBe('paused')

    const jobB = await createSearch('Browser owner B', 'Song B')
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.jobs.find((job) => job.id === jobB.jobId)?.state
      })
      .toBe('paused')

    await page.getByRole('button', { name: 'Задания', exact: true }).click()
    const cardA = page.locator('.job').filter({ hasText: 'Browser owner A' })
    await expect(cardA).toBeVisible()
    await cardA.getByRole('button', { name: 'Открыть Spotify здесь', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Продолжить поиск', exact: true }),
    ).toBeVisible()

    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', false))
    await dialog.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Browser owner A', exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.vkspot.state())
        return state.ok && state.value.jobs.find((job) => job.id === jobA.jobId)?.state
      })
      .toBe('complete')

    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.jobs.find((job) => job.id === jobA.jobId)?.state).toBe('complete')
    expect(state.value.jobs.find((job) => job.id === jobB.jobId)?.state).toBe('paused')
    expect(
      state.value.collections.find((item) => item.id === jobA.collectionId)?.rows[0].working,
    ).toMatchObject({ searchedQuery: 'Artist Song A', candidates: [{ title: 'Song' }] })
    expect(
      state.value.collections.find((item) => item.id === jobB.collectionId)?.rows[0].working,
    ).toMatchObject({ searchedQuery: null, candidates: [] })
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('file import starts search by default and a manual pause survives restart without repeating saved rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  let app = await launch(directory)
  try {
    await mockPages(app)
    let page = await app.firstWindow()
    const file = join(directory, 'import.csv')
    await writeFile(file, 'artist,title,duration\nArtist,Song,180\nArtist,Missing,180\n')
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, file)
    await page.getByRole('button', { name: 'Импортировать файл', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Начать поиск после сохранения', exact: true }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Сохранить 2 записей', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.cursor
      })
      .toBe(1)
    await page.getByRole('button', { name: 'Пауза поиска', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('paused')
    await app.close()
    app = await launch(directory)
    await mockPages(app)
    page = await app.firstWindow()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.jobs[0]).toMatchObject({
      state: 'paused',
      cursor: 1,
      autoResume: false,
      searchProvider: 'browser',
    })
    expect(state.value.collections[0].rows[0].working.candidates).toHaveLength(1)
    expect(await app.evaluate(() => Reflect.get(globalThis, '__browserQueries'))).toEqual([])
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    expect(await app.evaluate(() => Reflect.get(globalThis, '__browserQueries'))).toEqual([
      'Artist Missing',
    ])
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('a song title that looks like an error does not stop a valid search', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await app.evaluate(async ({ session }) => {
      await session
        .fromPartition('persist:vkspot-spotify-browser')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><main><div data-testid="tracklist-row"><a href="/track/aaaaaaaaaaaaaaaaaaaaaa">Something Went Wrong / Too Many Requests</a><a href="/artist/bbbbbbbbbbbbbbbbbbbbbb">Artist</a><span>3:00</span></div></main>',
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            ),
        )
    })
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Error-like title',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [
          { artist: 'Artist', title: 'Something Went Wrong / Too Many Requests', duration: 180 },
        ],
      } as never),
    )
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[0].working.candidates[0].title).toBe(
      'Something Went Wrong / Too Many Requests',
    )
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('search handles hour-long track durations such as 1:12:28', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await app.evaluate(async ({ session }) => {
      await session
        .fromPartition('persist:vkspot-spotify-browser')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><main><div data-testid="tracklist-row"><a href="/track/1111111111111111111111">Standard Track</a><a href="/artist/aaaaaaaaaaaaaaaaaaaaaa">Artist</a><span>3:19</span></div><div data-testid="tracklist-row"><a href="/track/2222222222222222222222">Live Festival Mix</a><a href="/artist/bbbbbbbbbbbbbbbbbbbbbb">Groove Armada</a><span>1:12:28</span></div></main>',
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            ),
        )
    })
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Long track test',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Standard Track', duration: 199 }],
      } as never),
    )
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    const candidates = state.value.collections[0].rows[0].working.candidates
    expect(candidates).toHaveLength(2)
    expect(candidates[0].duration).toBe(199)
    expect(candidates[1].duration).toBe(4348)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('search handles Russian localized empty search results such as "Треки не найдены"', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-browser-'))
  const app = await launch(directory)
  try {
    await app.evaluate(async ({ session }) => {
      await session
        .fromPartition('persist:vkspot-spotify-browser')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><main><h2>По запросу «Cascade Everytime We Touch Radio Edit» Треки не найдены</h2><p>Проверь, нет ли опечаток, сократи запрос или перефразируй его.</p><button>Все</button></main>',
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            ),
        )
    })
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Empty search localization test',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Cascade', title: 'Everytime We Touch Radio Edit', duration: 199 }],
      } as never),
    )
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(() => window.vkspot.state())
          return s.ok && s.value.jobs[0]?.state
        },
        { timeout: 15000 },
      )
      .toBe('complete')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    const candidates = state.value.collections[0].rows[0].working.candidates
    expect(candidates).toHaveLength(0)
    expect(state.value.collections[0].rows[0].working.searchedQuery).toBe(
      'Cascade Everytime We Touch Radio Edit',
    )
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
