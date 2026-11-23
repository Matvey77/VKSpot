import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getAppState,
  importSyntheticCollection,
  installSpotifyBrowserMock,
  updateAppSettings,
} from './mocks'
import { openLibrary } from './navigation'
import { setWindowContentSize, withTestApp } from './support'

test('inspector searches Spotify again after cached results and displays progress, empty results and errors', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
    const page = await app.firstWindow()
    const original = await importSyntheticCollection(page, {
      name: 'Manual search fixture',
      origin: 'Synthetic',
      tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
    })
    await page.evaluate(
      ({ collectionId, rowId }) => window.vkspot.startSearch(collectionId, [rowId], true),
      { collectionId: original.id, rowId: original.rows[0].id },
    )
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
    const state = await getAppState(page)
    expect(state.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.collections[0].rows[0].source).toEqual(original.rows[0].source)
  })
})

test('browser search needs no API login, caches repeats, keeps source and offers the next review step', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
    const page = await app.firstWindow()
    await expect(
      page.getByRole('heading', { name: 'Твоя музыка из VK — в Spotify', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.next-action')).toHaveCount(1)
    await expect(page.locator('.guide-canvas')).toHaveCount(0)
    await page.screenshot({ path: '.local/evidence/e2e/start-simple.png' })
    const original = await importSyntheticCollection(page, {
      name: 'Browser fixture',
      origin: 'Synthetic',
      tracks: ['Song', 'Song', 'Missing'].map((title) => ({
        artist: 'Artist',
        title,
        duration: 180,
      })),
    })
    await updateAppSettings(page, { searchDelayMs: 1000 })
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
    const state = await getAppState(page)
    expect(state.spotify.connected).toBe(false)
    expect(state.jobs[0].searchProvider).toBe('browser')
    expect(state.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.collections[0].rows.map((r) => r.source)).toEqual(
      original.rows.map((r) => r.source),
    )
    expect(state.collections[0].rows[0].working.candidates[0]).toMatchObject({
      title: 'Song',
      artists: ['Artist'],
      duration: 180,
    })
    expect(state.collections[0].rows[2].working).toMatchObject({
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
    await setWindowContentSize(app, 1000, 760)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: '.local/evidence/e2e/browser-results-compact.png' })
    await updateAppSettings(page, { theme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({
      path: '.local/evidence/e2e/browser-results-compact-dark.png',
      animations: 'disabled',
    })
  })
})

test('browser Retry-After resumes automatically without using the API or sending an early request', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserLimited', true))
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Browser quota fixture',
      origin: 'Synthetic',
      tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
    })
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
  })
})

test('page challenge keeps the current track pending and recovers inside the app', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', true))
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Challenge fixture',
      origin: 'Synthetic',
      tracks: [{ artist: 'Artist', title: 'Song', duration: 180 }],
    })
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('paused')
    let state = await getAppState(page)
    expect(state.jobs[0].cursor).toBe(0)
    expect(state.collections[0].rows[0].working.searchedQuery).toBeNull()
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
    state = await getAppState(page)
    expect(state.collections[0].rows[0].working.candidates).toHaveLength(1)
  })
})

test('a stale Spotify panel owner cannot hide the newer owner view', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
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
  })
})

test('continuing a challenged job from its Jobs card resumes that collection only', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app)
    await app.evaluate(() => Reflect.set(globalThis, '__browserChallenge', true))
    const page = await app.firstWindow()
    const createSearch = async (name: string, title: string) => {
      const collection = await importSyntheticCollection(page, {
        name,
        origin: 'Synthetic',
        tracks: [{ artist: 'Artist', title, duration: 180 }],
      })
      const jobId = await page.evaluate(
        async ({ collectionId, rowId }) => {
          const started = await window.vkspot.startSearch(collectionId, [rowId], true)
          if (!started.ok) throw new Error(started.error)
          return started.value
        },
        { collectionId: collection.id, rowId: collection.rows[0].id },
      )
      return { collectionId: collection.id, jobId }
    }

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

    const state = await getAppState(page)
    expect(state.jobs.find((job) => job.id === jobA.jobId)?.state).toBe('complete')
    expect(state.jobs.find((job) => job.id === jobB.jobId)?.state).toBe('paused')
    expect(
      state.collections.find((item) => item.id === jobA.collectionId)?.rows[0].working,
    ).toMatchObject({ searchedQuery: 'Artist Song A', candidates: [{ title: 'Song' }] })
    expect(
      state.collections.find((item) => item.id === jobB.collectionId)?.rows[0].working,
    ).toMatchObject({ searchedQuery: null, candidates: [] })
  })
})

test('file import starts search by default and a manual pause survives restart without repeating saved rows', async () => {
  await withTestApp('vkspot-browser-', async (ctx) => {
    let app = ctx.app
    await installSpotifyBrowserMock(app)
    let page = await app.firstWindow()
    const file = join(ctx.directory, 'import.csv')
    await writeFile(file, 'artist,title,duration\nArtist,Song,180\nArtist,Missing,180\n')
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, file)
    await page.getByRole('button', { name: 'Импортировать файл', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Начать поиск после сохранения', exact: true }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Сохранить 2 записи', exact: true }).click()
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
    app = await ctx.relaunch()
    await installSpotifyBrowserMock(app)
    page = await app.firstWindow()
    const state = await getAppState(page)
    expect(state.jobs[0]).toMatchObject({
      state: 'paused',
      cursor: 1,
      autoResume: false,
      searchProvider: 'browser',
    })
    expect(state.collections[0].rows[0].working.candidates).toHaveLength(1)
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
  })
})

test('a song title that looks like an error does not stop a valid search', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app, {
      html: '<!doctype html><main><div data-testid="tracklist-row"><a href="/track/aaaaaaaaaaaaaaaaaaaaaa">Something Went Wrong / Too Many Requests</a><a href="/artist/bbbbbbbbbbbbbbbbbbbbbb">Artist</a><span>3:00</span></div></main>',
    })
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Error-like title',
      origin: 'Synthetic',
      tracks: [
        { artist: 'Artist', title: 'Something Went Wrong / Too Many Requests', duration: 180 },
      ],
    })
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    const state = await getAppState(page)
    expect(state.collections[0].rows[0].working.candidates[0].title).toBe(
      'Something Went Wrong / Too Many Requests',
    )
  })
})

test('search handles hour-long track durations such as 1:12:28', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app, {
      html: '<!doctype html><main><div data-testid="tracklist-row"><a href="/track/1111111111111111111111">Standard Track</a><a href="/artist/aaaaaaaaaaaaaaaaaaaaaa">Artist</a><span>3:19</span></div><div data-testid="tracklist-row"><a href="/track/2222222222222222222222">Live Festival Mix</a><a href="/artist/bbbbbbbbbbbbbbbbbbbbbb">Groove Armada</a><span>1:12:28</span></div></main>',
    })
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Long track test',
      origin: 'Synthetic',
      tracks: [{ artist: 'Artist', title: 'Standard Track', duration: 199 }],
    })
    await page.getByRole('button', { name: 'Начать поиск', exact: true }).click()
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.vkspot.state())
        return s.ok && s.value.jobs[0]?.state
      })
      .toBe('complete')
    const state = await getAppState(page)
    const candidates = state.collections[0].rows[0].working.candidates
    expect(candidates).toHaveLength(2)
    expect(candidates[0].duration).toBe(199)
    expect(candidates[1].duration).toBe(4348)
  })
})

test('search handles Russian localized empty search results such as "Треки не найдены"', async () => {
  await withTestApp('vkspot-browser-', async ({ app }) => {
    await installSpotifyBrowserMock(app, {
      html: '<!doctype html><main><h2>По запросу «Cascade Everytime We Touch Radio Edit» Треки не найдены</h2><p>Проверь, нет ли опечаток, сократи запрос или перефразируй его.</p><button>Все</button></main>',
    })
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Empty search localization test',
      origin: 'Synthetic',
      tracks: [{ artist: 'Cascade', title: 'Everytime We Touch Radio Edit', duration: 199 }],
    })
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
    const state = await getAppState(page)
    const candidates = state.collections[0].rows[0].working.candidates
    expect(candidates).toHaveLength(0)
    expect(state.collections[0].rows[0].working.searchedQuery).toBe(
      'Cascade Everytime We Touch Radio Edit',
    )
  })
})
