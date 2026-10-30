import { openLibrary, confirmMatches } from './navigation'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { cleanupTestProfile, createTestProfile, launchTestApp as launch } from './support'

async function mockSearch(app: ElectronApplication, autoResumeSearch = false): Promise<void> {
  await app.evaluate(async ({ session, shell }) => {
    await session.fromPartition('vkspot-spotify-api').protocol.handle('https', async (request) => {
      const url = new URL(request.url)
      if (url.hostname === 'accounts.spotify.com')
        return Response.json({
          access_token: 'synthetic',
          refresh_token: 'synthetic',
          expires_in: 3600,
        })
      if (url.pathname === '/v1/me') return Response.json({ id: 'synthetic-user' })
      if (url.pathname === '/v1/search') {
        await new Promise<void>((resolve) => Reflect.set(globalThis, '__releaseSearch', resolve))
        return Response.json({ tracks: { items: [] } })
      }
      return new Response('', { status: 404 })
    })
    shell.openExternal = async (address) => {
      const url = new URL(address)
      await fetch(
        'http://127.0.0.1:43823/callback?' +
          new URLSearchParams({ code: 'synthetic', state: url.searchParams.get('state')! }),
      )
    }
  })
  const page = await app.firstWindow()
  await page.evaluate(async (autoResumeSearch) => {
    const state = await window.vkspot.state()
    if (!state.ok) throw new Error(state.error)
    await window.vkspot.saveSettings({
      ...state.value.settings,
      clientId: 'a'.repeat(32),
      searchProvider: 'api',
      searchDelayMs: 1000,
      autoResumeSearch,
    })
    const result = await window.vkspot.connectSpotify()
    if (!result.ok) throw new Error(result.error)
  }, autoResumeSearch)
}

async function openReview(page: Page): Promise<void> {
  await openLibrary(page)
}

const cleanup = (directory: string) => cleanupTestProfile(directory, 'vkspot-review-')

test('independent filters, exposed decisions and manual Spotify links preserve source, undo and restart', async () => {
  const directory = await createTestProfile('vkspot-review-')
  let app = await launch(directory)
  try {
    let page = await app.firstWindow()
    await page.route('https://open.spotify.com/embed/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Spotify preview</p>' }),
    )
    const original = await page.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Decision fixture',
        origin: 'Synthetic',
        completeness: { expected: 4, status: 'verified-count', message: 'Test only' },
        tracks: [
          { artist: 'Artist', title: 'Song One', duration: 180 },
          { artist: 'Artist', title: 'Song Two', duration: 180 },
          { artist: 'Artist', title: 'Need file', duration: 180 },
          { artist: 'Artist', title: 'Worldwide', duration: 89 },
        ],
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections[0]
      for (const [index, row] of collection.rows.entries()) {
        const candidate = {
          uri: 'spotify:track:' + 'a'.repeat(22),
          url: '',
          title: row.working.title,
          artists: ['Artist'],
          duration: 180,
          album: 'Synthetic',
        }
        await window.vkspot.patchRows(collection.id, [row.id], {
          searchedQuery: `${row.working.artist} ${row.working.title}`,
          candidates: index < 2 ? [candidate] : [],
          ...(index === 1 ? { spotify: candidate, destination: 'spotify' as const } : {}),
          ...(index === 2 ? { localPending: true } : {}),
        })
      }
      return collection
    })
    await openLibrary(page)
    const resultFilter = page.getByRole('combobox', { name: 'Результат поиска', exact: true })
    const decisionFilter = page.getByRole('combobox', { name: 'Статус записей', exact: true })
    await resultFilter.selectOption('exact')
    await expect(page.getByRole('row')).toHaveCount(3)
    await expect(decisionFilter.locator('option[value="spotify"]')).toHaveText('Spotify (1)')
    await decisionFilter.selectOption('spotify')
    await expect(page.getByRole('row', { name: 'Запись 2: Song Two', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByLabel('Найти запись', { exact: true }).fill('Artist Song')
    await expect(page.getByRole('row')).toHaveCount(3)
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()

    await page.getByLabel('Выбрать запись 1', { exact: true }).check()
    await page.getByLabel('Выбрать запись 4', { exact: true }).check()
    await expect(page.getByLabel('Решения для выбранных записей')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Действие с выбранными' })).toHaveCount(0)
    await resultFilter.selectOption('missing')
    await expect(page.locator('.selection-bar')).toContainText('вне выборки 1')
    await page.getByRole('button', { name: 'Оставить только видимые', exact: true }).click()
    await page.getByRole('button', { name: 'Исключить', exact: true }).click()
    await expect(page.getByRole('row', { name: 'Запись 4: Worldwide', exact: true })).toContainText(
      'Исключённые',
    )
    await page.getByRole('button', { name: 'Вернуть в перенос', exact: true }).click()
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByLabel('Выбрать запись 2', { exact: true }).check()
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Нужен локальный файл', exact: true })
      .click()
    await expect(page.getByRole('row', { name: 'Запись 2: Song Two', exact: true })).toContainText(
      'Нужен файл',
    )
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Сбросить решение', exact: true })
      .click()
    await expect(page.getByRole('row', { name: 'Запись 2: Song Two', exact: true })).toContainText(
      'Нужен выбор',
    )
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await expect(page.getByRole('row', { name: 'Запись 2: Song Two', exact: true })).toContainText(
      'Нужен файл',
    )
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()

    await page.getByRole('row', { name: 'Запись 4: Worldwide', exact: true }).click()
    const inspector = page.locator('.inspector')
    await expect(inspector).toBeVisible()
    await expect(page.locator('.selection-bar')).toContainText('Выбрано 1')
    await inspector.getByRole('button', { name: 'Указать трек Spotify', exact: true }).click()
    const link = inspector.getByLabel('Ссылка или URI трека Spotify', { exact: true })
    await link.fill('https://open.spotify.com/playlist/' + 'b'.repeat(22))
    await inspector
      .getByRole('button', { name: 'Подтвердить этот трек Spotify', exact: true })
      .click()
    await expect(inspector.getByRole('alert')).toContainText('именно на трек')
    await link.fill('https://open.spotify.com/intl-ru/track/' + 'b'.repeat(22) + '?si=shared')
    await inspector.getByRole('button', { name: 'Проверить в плеере Spotify', exact: true }).click()
    await expect(
      inspector.getByTitle('Проверка трека Spotify по ссылке', { exact: true }),
    ).toHaveAttribute('src', /embed\/track\/b{22}/)
    await inspector.getByRole('button', { name: 'Скрыть плеер', exact: true }).click()
    await inspector
      .getByLabel('Название для привязки', { exact: true })
      .fill('Worldwide (Original)')
    await inspector.getByLabel('Альбом (необязательно)', { exact: true }).fill('Manual Album')
    await inspector
      .getByRole('button', { name: 'Подтвердить этот трек Spotify', exact: true })
      .click()
    await expect(inspector.locator('.chosen-match')).toContainText('Worldwide (Original)')
    await expect(inspector.locator('.chosen-match')).toContainText('1:29')
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await expect(inspector.locator('.chosen-match')).toHaveCount(0)
    await inspector.getByRole('button', { name: 'Указать трек Spotify', exact: true }).click()
    await inspector
      .getByRole('button', { name: 'Подтвердить этот трек Spotify', exact: true })
      .click()
    await expect(inspector.locator('.chosen-match')).toContainText('Worldwide (Original)')
    await page.getByLabel('Выбрать запись 1', { exact: true }).check()
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(async (theme) => {
        const state = await window.vkspot.state()
        if (state.ok) await window.vkspot.saveSettings({ ...state.value.settings, theme })
      }, theme)
      for (const width of [1440, 940]) {
        await app.evaluate(
          ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900),
          width,
        )
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await inspector.locator('.inspector-scroll-area').evaluate((element) => {
          element.scrollTop = 0
        })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({ path: `.local/evidence/e2e/decisions-${theme}-${width}.png` })
        if (theme === 'light' && width === 1440) {
          await inspector.getByRole('button', { name: 'Указать трек Spotify', exact: true }).click()
          await inspector
            .getByLabel('Ссылка или URI трека Spotify', { exact: true })
            .scrollIntoViewIfNeeded()
          await page.screenshot({ path: '.local/evidence/e2e/manual-spotify-form.png' })
          await inspector.getByRole('button', { name: 'Указать трек Spotify', exact: true }).click()
        }
      }
    }
    await app.close()
    app = await launch(directory)
    page = await app.firstWindow()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[3].working).toMatchObject({
      destination: 'spotify',
      spotify: {
        title: 'Worldwide (Original)',
        uri: 'spotify:track:' + 'b'.repeat(22),
        duration: 89,
      },
      candidates: [],
      searchedQuery: 'Artist Worldwide',
    })
    expect(state.value.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.value.collections[0].rows.map((row) => row.source)).toEqual(
      original.rows.map((row) => row.source),
    )
    expect(state.value.collections[0].rows[0].working.excluded).toBe(false)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('review confirms repeated metadata matches, advances through versions and preserves file obligations', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    const imported = await page.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Review fixture',
        origin: 'Synthetic test',
        completeness: { expected: 5, status: 'unverified', message: 'Test only' },
        tracks: [
          { id: 'repeat', artist: 'Artist', title: 'Plain Song', duration: 181 },
          { id: 'repeat', artist: 'Artist', title: 'Plain Song', duration: 181 },
          { id: 'edit', artist: 'Artist', title: 'Song [DJ edit]', duration: 180 },
          { id: 'missing', artist: 'Artist', title: 'Unknown', duration: 120 },
          { id: 'later', artist: 'Artist', title: 'Later Song (Remix)', duration: 180 },
        ],
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      for (const [index, row] of state.value.collections[0].rows.entries()) {
        const candidate = {
          uri: 'spotify:track:' + (index < 2 ? 'a' : 'b').repeat(22),
          title: index < 2 ? 'Plain Song' : index === 2 ? 'Song' : 'Later Song',
          artists: ['Artist'],
          duration: 180,
          url: '',
          album: 'Test',
        }
        await window.vkspot.patchRows(result.value, [row.id], {
          candidates: index === 3 ? [] : [candidate],
          searchedQuery: `${row.working.artist} ${row.working.title}`,
        })
      }
      return result.value
    })

    await openReview(page)
    await confirmMatches(page)
    let state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(
      state.value.collections[0].rows
        .slice(0, 2)
        .every((row) => row.working.destination === 'spotify'),
    ).toBe(true)
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await confirmMatches(page)
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByRole('row', { name: 'Запись 3: Song [DJ edit]', exact: true }).click()
    await expect(page.locator('.inspector')).toContainText('Song [DJ edit]')
    await page.screenshot({ path: '.local/evidence/e2e/review-versions-desktop.png' })
    await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
    await page.getByLabel('Выбрать запись 3', { exact: true }).check()
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Нужен локальный файл', exact: true })
      .click()
    await expect(
      page.getByRole('row', { name: 'Запись 3: Song [DJ edit]', exact: true }),
    ).toContainText('Нужен файл')
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await page.getByRole('row', { name: 'Запись 5: Later Song (Remix)', exact: true }).click()
    await page.locator('.candidate').getByRole('button', { name: 'Выбрать', exact: true }).click()
    await expect(page.locator('.destination-state')).toContainText('Spotify')
    await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
    await page
      .getByRole('combobox', { name: 'Результат поиска', exact: true })
      .selectOption('missing')
    await page.getByRole('button', { name: /Выделить выборку/ }).click()
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Нужен локальный файл', exact: true })
      .click()
    await page.getByRole('combobox', { name: 'Результат поиска', exact: true }).selectOption('all')
    await page.getByLabel('Статус записей', { exact: true }).selectOption('local-pending')
    await expect(page.getByRole('row')).toHaveCount(3)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await page.screenshot({ path: '.local/evidence/e2e/review-files-compact.png' })
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (state.ok) await window.vkspot.saveSettings({ ...state.value.settings, theme: 'dark' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({
      path: '.local/evidence/e2e/review-files-dark.png',
      animations: 'disabled',
    })
    state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    const collection = state.value.collections.find((item) => item.id === imported)!
    expect(collection.rows).toHaveLength(5)
    expect(collection.rows[2].source.title).toBe('Song [DJ edit]')
    expect(collection.rows[2].working.localPending).toBe(true)
    expect(collection.rows[2].working.destination).toBe('unresolved')
    expect(collection.rows[4].working.destination).toBe('spotify')
    expect(collection.rows[0].working.spotify?.uri).toBe(collection.rows[1].working.spotify?.uri)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('collection runs a resumable background search without switching to jobs or confirming versions', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    await app.evaluate(async ({ session, shell }) => {
      await session.fromPartition('vkspot-spotify-api').protocol.handle('https', (request) => {
        const url = new URL(request.url)
        if (url.hostname === 'accounts.spotify.com')
          return Response.json({
            access_token: 'synthetic',
            refresh_token: 'synthetic',
            expires_in: 3600,
          })
        if (url.pathname === '/v1/me') return Response.json({ id: 'synthetic-user' })
        if (url.pathname === '/v1/search') return Response.json({ tracks: { items: [] } })
        return new Response('', { status: 404 })
      })
      shell.openExternal = async (address) => {
        const url = new URL(address)
        await fetch(
          'http://127.0.0.1:43823/callback?' +
            new URLSearchParams({ code: 'synthetic', state: url.searchParams.get('state')! }),
        )
      }
    })
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      await window.vkspot.saveSettings({
        ...state.value.settings,
        clientId: 'a'.repeat(32),
        searchProvider: 'api',
        searchDelayMs: 1000,
      })
      const connected = await window.vkspot.connectSpotify()
      if (!connected.ok) throw new Error(connected.error)
      return window.vkspot.importCollection({
        name: 'Background fixture',
        origin: 'Synthetic test',
        completeness: { expected: 4, status: 'unverified', message: 'Test only' },
        tracks: Array.from({ length: 4 }, (_, i) => ({ artist: 'Artist', title: `Song ${i}` })),
      } as never)
    })
    await openReview(page)
    await page.getByRole('button', { name: 'Фоновый поиск (4)', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Background fixture', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Пауза поиска', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Пауза поиска', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeEnabled()
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections[0]
      await window.vkspot.patchRows(collection.id, [collection.rows[3].id], { localPending: true })
    })
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(page.getByText('Поиск завершён · 4 / 4', { exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Результат поиска' })).toContainText(
      'Ничего не найдено (3)',
    )
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(
      state.value.collections[0].rows
        .slice(0, 3)
        .every(
          (row) => row.working.destination === 'unresolved' && row.working.searchedQuery !== null,
        ),
    ).toBe(true)
    expect(state.value.collections[0].rows[3].working.searchedQuery).toBeNull()
    expect(state.value.collections[0].rows[3].working.localPending).toBe(true)
    expect(state.value.jobs[0].backgroundSearch).toBe(true)
    expect(state.value.jobs[0].state).toBe('complete')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('resumed search keeps decisions and repeated pause available, including after restart', async () => {
  const directory = await createTestProfile('vkspot-review-')
  let app = await launch(directory)
  try {
    await mockSearch(app)
    let page = await app.firstWindow()
    await page.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Resume regression',
        origin: 'Synthetic test',
        completeness: { expected: 4, status: 'verified-count', message: 'Test only' },
        tracks: ['Ready (Remix)', 'Hold 1', 'Hold 2', 'Hold 3'].map((title) => ({
          artist: 'Artist',
          title,
          duration: 180,
        })),
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const row = state.value.collections[0].rows[0]
      await window.vkspot.patchRows(result.value, [row.id], {
        candidates: [
          {
            uri: 'spotify:track:' + 'a'.repeat(22),
            title: 'Ready (Remix)',
            artists: ['Artist'],
            duration: 180,
            album: '',
            url: '',
          },
        ],
        searchedQuery: 'Artist Ready (Remix)',
      })
    })
    await openReview(page)
    await page.getByRole('button', { name: 'Фоновый поиск (3)', exact: true }).click()
    const pause = page.getByRole('button', { name: 'Пауза поиска', exact: true })
    await pause.click()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await app.evaluate(() => {
      Reflect.get(globalThis, '__releaseSearch')()
      Reflect.deleteProperty(globalThis, '__releaseSearch')
    })
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(pause).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Коллекции', exact: true })).toBeEnabled()
    await page.getByRole('row').nth(1).click()
    await page.locator('.candidate').getByRole('button', { name: 'Выбрать', exact: true }).click()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[0].working.destination).toBe('spotify')
    expect(state.value.jobs[0].state).toBe('running')
    await pause.click()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await app.evaluate(() => {
      Reflect.get(globalThis, '__releaseSearch')()
      Reflect.deleteProperty(globalThis, '__releaseSearch')
    })
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(pause).toBeEnabled()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    // Close during a request. Remove only the synthetic token before restarting
    // so startup cannot send a real request before the test installs its mock.
    await app.close()
    await rm(join(directory, 'spotify.enc'), { force: true })
    app = await launch(directory)
    page = await app.firstWindow()
    await mockSearch(app)
    await openReview(page)
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeEnabled()
    const restored = await page.evaluate(() => window.vkspot.state())
    if (!restored.ok) throw new Error(restored.error)
    expect(restored.value.jobs[0].cursor).toBe(2)
    expect(restored.value.collections[0].rows[0].working.destination).toBe('spotify')
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Пауза поиска', exact: true })).toBeEnabled()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await app.evaluate(() => {
      Reflect.get(globalThis, '__releaseSearch')()
      Reflect.deleteProperty(globalThis, '__releaseSearch')
    })
    await expect(page.getByText('Поиск завершён · 3 / 3', { exact: true })).toBeVisible()
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('collection filters support keyboard selection and preserve the visible table', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Keyboard fixture',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'unverified', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await openReview(page)
    const filter = page.getByRole('combobox', { name: 'Результат поиска' })
    const isMac = (await app.evaluate(() => process.platform)) === 'darwin'
    const optionCount = await filter.locator('option').count()
    const chooseWithKeyboard = async (end: boolean) => {
      await filter.focus()
      if (isMac) {
        // macOS opens a native menu; Home and End do not select its first/last item.
        await page.keyboard.press('Space')
        for (let index = 1; index < optionCount; index++) {
          await page.keyboard.press(end ? 'ArrowDown' : 'ArrowUp')
        }
      } else {
        await page.keyboard.press(end ? 'End' : 'Home')
      }
      await page.keyboard.press('Enter')
    }
    await chooseWithKeyboard(true)
    await expect(filter).toHaveValue('missing')
    await expect(page.getByRole('table')).toBeVisible()
    await chooseWithKeyboard(false)
    await expect(filter).toHaveValue('all')
    await expect(page.getByRole('row', { name: 'Запись 1: Song', exact: true })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /Выделить выборку/ })).toBeFocused()
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('unavailable background search explains the connection requirement on hover and keyboard focus', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Hint fixture',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await openReview(page)
    await page.evaluate(async () => {
      const s = await window.vkspot.state()
      if (s.ok) await window.vkspot.saveSettings({ ...s.value.settings, searchProvider: 'api' })
    })
    const search = page.getByRole('button', { name: 'Фоновый поиск (1)', exact: true })
    await expect(search).toBeDisabled()
    await expect(search).toHaveAccessibleDescription(/Подключи Spotify/)
    const hint = page.getByRole('group', { name: 'Почему фоновый поиск недоступен', exact: true })
    await hint.hover()
    await expect(page.getByRole('tooltip')).toContainText('Подключи Spotify')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await hint.focus()
    await expect(page.getByRole('tooltip')).toContainText('Уже найденные версии')
    await page.screenshot({
      path: '.local/evidence/e2e/search-disabled-hint.png',
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('Spotify quota wait preserves candidates, explains the deadline and unlocks manual continuation', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    await mockSearch(app)
    await app.evaluate(async ({ session }) => {
      Reflect.set(globalThis, '__quotaLimited', true)
      Reflect.set(globalThis, '__searchCalls', 0)
      const network = session.fromPartition('vkspot-spotify-api')
      await network.protocol.unhandle('https')
      await network.protocol.handle('https', (request) => {
        const url = new URL(request.url)
        if (url.pathname !== '/v1/search') return new Response('', { status: 404 })
        Reflect.set(globalThis, '__searchCalls', Reflect.get(globalThis, '__searchCalls') + 1)
        if (url.searchParams.get('q')?.includes('Plain Song'))
          return Response.json({
            tracks: {
              items: [
                {
                  uri: 'spotify:track:' + 'a'.repeat(22),
                  name: 'Plain Song',
                  artists: [{ name: 'Artist' }],
                  duration_ms: 180000,
                  album: { name: 'Synthetic' },
                  external_urls: { spotify: '' },
                },
              ],
            },
          })
        return Reflect.get(globalThis, '__quotaLimited')
          ? Response.json(
              { error: { reason: 'QUOTA_EXCEEDED' } },
              { status: 429, headers: { 'Retry-After': '11760' } },
            )
          : Response.json({ tracks: { items: [] } })
      })
    })
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Quota fixture',
        origin: 'Synthetic test',
        completeness: { expected: 2, status: 'verified-count', message: 'Test only' },
        tracks: ['Plain Song', 'Limited Song'].map((title) => ({
          artist: 'Artist',
          title,
          duration: 180,
        })),
      } as never),
    )
    await openReview(page)
    await page.getByRole('button', { name: 'Фоновый поиск (2)', exact: true }).click()
    await expect(page.getByText('Поиск ожидает Spotify · 1 / 2', { exact: true })).toBeVisible()
    await expect(page.locator('.review-progress')).toContainText('Исчерпана квота запросов Spotify')
    await expect(page.locator('.review-progress')).toContainText('Осталось 3 ч 16 мин')
    await expect(page.locator('.review-progress')).not.toContainText('11760')
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeDisabled()
    await page
      .getByRole('group', { name: 'Почему управление поиском недоступно', exact: true })
      .hover()
    await expect(page.getByRole('tooltip')).toContainText('Повтор не раньше')
    await page.screenshot({
      path: '.local/evidence/e2e/search-quota-hint.png',
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await confirmMatches(page)
    const before = await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const denied = await window.vkspot.controlJob(state.value.jobs[0].id, 'resume')
      return { state: state.value, denied }
    })
    expect(before.denied.ok).toBe(false)
    expect(before.state.collections[0].rows[0].working.destination).toBe('spotify')
    expect(before.state.jobs[0].cursor).toBe(1)
    expect(await app.evaluate(() => Reflect.get(globalThis, '__searchCalls'))).toBe(2)
    await page.getByRole('button', { name: 'Задания', exact: true }).click()
    await expect(page.locator('.job')).toContainText('Ожидание Spotify')
    await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (state.ok) await window.vkspot.saveSettings({ ...state.value.settings, theme: 'dark' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page
      .getByRole('group', { name: 'Почему продолжение задания недоступно', exact: true })
      .focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await page.screenshot({
      path: '.local/evidence/e2e/jobs-quota-compact-dark.png',
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    // Shorten only the synthetic server deadline, then exercise the real UI clock.
    const database = new DatabaseSync(join(directory, 'collection.db'))
    try {
      const job = { ...before.state.jobs[0], retryAt: Date.now() + 2500 }
      database
        .prepare('UPDATE settings SET value=? WHERE key=?')
        .run(JSON.stringify(job.retryAt), 'spotify-api-retryAt')
      database.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(job), job.id)
    } finally {
      database.close()
    }
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (state.ok) await window.vkspot.patchRows(state.value.collections[0].id, [], {})
    })
    await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeEnabled({
      timeout: 6000,
    })
    await expect(page.locator('.job')).toContainText('Срок ожидания Spotify истёк')
    expect(await app.evaluate(() => Reflect.get(globalThis, '__searchCalls'))).toBe(2)
    await app.evaluate(() => Reflect.set(globalThis, '__quotaLimited', false))
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
    await expect(page.locator('.job .status-tag')).toHaveText('Завершено')
    const result = await page.evaluate(() => window.vkspot.state())
    if (!result.ok) throw new Error(result.error)
    expect(result.value.jobs[0].cursor).toBe(2)
    expect(result.value.jobs[0].retryAt).toBeUndefined()
    expect(result.value.collections[0].rows[0].working.spotify?.title).toBe('Plain Song')
    expect(await app.evaluate(() => Reflect.get(globalThis, '__searchCalls'))).toBe(3)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('table opens first, filters statuses and confirms an entire virtualized matching selection with undo', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    const original = await page.evaluate(async () => {
      const tracks = [
        { artist: 'Artist', title: 'Plain Song', duration: 180 },
        { artist: 'Artist', title: 'Plain Song', duration: 180 },
        ...[
          'Version (Remix)',
          'Missing',
          'Pending',
          'Need file',
          'Deferred',
          'Chosen',
          'Excluded',
        ].map((title) => ({ artist: 'Artist', title, duration: 180 })),
        ...Array.from({ length: 1500 }, () => ({
          artist: 'Artist',
          title: 'Plain Song',
          duration: 180,
        })),
      ]
      const imported = await window.vkspot.importCollection({
        name: 'Status table',
        origin: 'Synthetic test',
        completeness: { expected: tracks.length, status: 'verified-count', message: 'Test only' },
        tracks,
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const c = state.value.collections[0]
      const candidate = {
        uri: 'spotify:track:' + 'a'.repeat(22),
        title: 'Plain Song',
        artists: ['Artist'],
        duration: 180,
        album: '',
        url: '',
      }
      await window.vkspot.patchRows(
        c.id,
        c.rows.filter((_, i) => i < 2 || i >= 9).map((row) => row.id),
        { candidates: [candidate], searchedQuery: 'Artist Plain Song' },
      )
      await window.vkspot.patchRows(c.id, [c.rows[2].id], {
        candidates: [{ ...candidate, title: 'Version' }],
        searchedQuery: 'Artist Version (Remix)',
      })
      await window.vkspot.patchRows(c.id, [c.rows[3].id], {
        candidates: [],
        searchedQuery: 'Artist Missing',
      })
      await window.vkspot.patchRows(c.id, [c.rows[5].id], { localPending: true })
      await window.vkspot.patchRows(c.id, [c.rows[6].id], { reviewDeferred: true })
      await window.vkspot.patchRows(c.id, [c.rows[7].id], {
        spotify: candidate,
        destination: 'spotify',
      })
      await window.vkspot.patchRows(c.id, [c.rows[8].id], { excluded: true })
      return { id: c.id, hash: c.sourceHash, ids: c.rows.map((row) => row.id) }
    })
    await openLibrary(page)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(
      page.getByRole('columnheader', { name: 'Результат поиска', exact: true }),
    ).toBeVisible()
    expect(await page.getByRole('row').count()).toBeLessThan(80)
    for (const [position, title, status] of [
      [1, 'Plain Song', 'Совпадают данные'],
      [3, 'Version (Remix)', 'Проверить версию'],
      [4, 'Missing', 'Ничего не найдено'],
      [5, 'Pending', 'Не искали'],
      [6, 'Need file', 'Нужен файл'],
      [7, 'Deferred', 'На потом'],
    ] as const) {
      await expect(
        page.getByRole('row', { name: `Запись ${position}: ${title}`, exact: true }),
      ).toContainText(status)
    }
    await page
      .getByRole('combobox', { name: 'Результат поиска', exact: true })
      .selectOption('exact')
    await page.getByRole('button', { name: /Выделить выборку/ }).click()
    await expect(page.locator('.selection-bar')).toContainText(/Выбрано 1\s502/)
    await expect(page.getByRole('button', { name: /Подтвердить выбранные/ })).toBeEnabled()
    await page.screenshot({
      path: '.local/evidence/e2e/status-table-desktop.png',
      animations: 'disabled',
    })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await page.screenshot({
      path: '.local/evidence/e2e/status-table-compact.png',
      animations: 'disabled',
    })
    expect(
      await page
        .locator('.table-scroll')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await page.getByRole('button', { name: /Подтвердить выбранные/ }).click()
    const confirmed = await page.evaluate(() => window.vkspot.state())
    if (!confirmed.ok) throw new Error(confirmed.error)
    expect(
      confirmed.value.collections[0].rows.filter((row) => row.working.destination === 'spotify'),
    ).toHaveLength(1503)
    expect(confirmed.value.collections[0].sourceHash).toBe(original.hash)
    expect(confirmed.value.collections[0].rows.map((row) => row.id)).toEqual(original.ids)
    await expect(page.locator('.selection-bar')).toHaveCount(0)
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByLabel('Статус записей', { exact: true }).selectOption('excluded')
    await page.getByRole('combobox', { name: 'Результат поиска', exact: true }).selectOption('all')
    await page.getByLabel('Найти запись', { exact: true }).fill('Excluded')
    await expect(page.getByRole('row')).toHaveCount(2)
    await page.getByRole('button', { name: /Выделить выборку/ }).click()
    await page
      .getByRole('combobox', { name: 'Результат поиска', exact: true })
      .selectOption('missing')
    await expect(page.locator('.selection-bar')).toContainText('вне выборки 1')
    await expect(page.getByRole('button', { name: /Подтвердить выбранные/ })).toBeDisabled()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByRole('button', { name: /Выделить совпадения/ }).click()
    await expect(page.getByRole('combobox', { name: 'Результат поиска', exact: true })).toHaveValue(
      'exact',
    )
    await expect(page.locator('.selection-bar')).toContainText(/Выбрано 1\s502/)
    await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByRole('button', { name: 'Разобрать запись 3', exact: true }).click()
    await expect(page.locator('.inspector')).toContainText('Version (Remix)')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('automatic search is on by default, respects Spotify wait and supports a persistent off switch', async () => {
  const directory = await createTestProfile('vkspot-review-')
  let app = await launch(directory)
  try {
    let page = await app.firstWindow()
    const initial = await page.evaluate(() => window.vkspot.state())
    if (!initial.ok) throw new Error(initial.error)
    expect(initial.value.settings.autoResumeSearch).toBe(true)
    await mockSearch(app, true)
    await app.evaluate(async ({ session }) => {
      Reflect.set(globalThis, '__autoCalls', [])
      const network = session.fromPartition('vkspot-spotify-api')
      await network.protocol.unhandle('https')
      await network.protocol.handle('https', (request) => {
        if (new URL(request.url).pathname !== '/v1/search') return new Response('', { status: 404 })
        const calls = Reflect.get(globalThis, '__autoCalls') as number[]
        calls.push(Date.now())
        return calls.length === 1
          ? Response.json(
              { error: { reason: 'QUOTA_EXCEEDED' } },
              { status: 429, headers: { 'Retry-After': '3' } },
            )
          : Response.json({ tracks: { items: [] } })
      })
    })
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Automatic fixture',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Автоматически продолжать фоновый поиск', exact: true }),
    ).toBeChecked()
    await openLibrary(page)
    await page.getByRole('button', { name: 'Фоновый поиск (1)', exact: true }).click()
    await expect(page.locator('.review-progress')).toContainText('Поиск продолжится автоматически')
    await expect(page.getByRole('button', { name: 'Оставить на паузе', exact: true })).toBeEnabled()
    await expect(page.getByText('Поиск завершён · 1 / 1', { exact: true })).toBeVisible({
      timeout: 10000,
    })
    const calls = await app.evaluate(() => Reflect.get(globalThis, '__autoCalls') as number[])
    expect(calls).toHaveLength(2)
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(3000)
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'Автоматически продолжать фоновый поиск', exact: true })
      .uncheck()
    await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await app.close()
    await rm(join(directory, 'spotify.enc'), { force: true })
    app = await launch(directory)
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Автоматически продолжать фоновый поиск', exact: true }),
    ).not.toBeChecked()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.settings.autoResumeSearch).toBe(false)
    expect(state.value.collections[0].rows[0].working.searchedQuery).toBe('Artist Song')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('in-app audio comparison controls are available for VK source and Spotify candidates', async () => {
  const directory = await createTestProfile('vkspot-review-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    await page.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Audio review fixture',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'unverified', message: 'Test only' },
        tracks: [{ id: 'vk_123', artist: 'Test Artist', title: 'Test Song', duration: 180 }],
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const row = state.value.collections[0].rows[0]
      const candidate = {
        uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
        title: 'Test Song',
        artists: ['Test Artist'],
        duration: 180,
        url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        album: 'Test Album',
      }
      await window.vkspot.patchRows(result.value, [row.id], {
        candidates: [candidate],
        searchedQuery: 'Test Artist Test Song',
      })
    })

    await openReview(page)
    await page.getByRole('row').nth(1).click()

    // 1. VK audio button is visible
    const vkListenBtn = page.locator('.review-audio-bar .audio-listen-button')
    await expect(vkListenBtn).toBeVisible()
    await expect(vkListenBtn).toContainText('Слушать оригинал VK')

    // 2. Spotify candidate listen button is visible
    const spotifyListenBtn = page.locator('.candidate .audio-listen-button')
    await expect(spotifyListenBtn).toBeVisible()
    await expect(spotifyListenBtn).toContainText('Слушать')

    // 3. Toggle Spotify embed player
    await spotifyListenBtn.click()
    await expect(spotifyListenBtn).toContainText('Пауза')
    const iframe = page.locator('.spotify-embed-card iframe')
    await expect(iframe).toBeVisible()
    expect(await iframe.getAttribute('src')).toContain(
      'open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
    )

    // 4. Hide player
    await spotifyListenBtn.click()
    await expect(spotifyListenBtn).toContainText('Слушать')
    await expect(page.locator('.spotify-embed-card iframe')).toHaveCount(0)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('table inspector supports resizing, layout toggle (parallel/sequential), reset decision and candidate audio preview', async () => {
  const directory = await createTestProfile('vkspot-review-inspector-')
  const app = await launch(directory)
  try {
    const page = await app.firstWindow()
    await page.evaluate(async () => {
      const candidate = {
        uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
        title: 'Song Title',
        artists: ['Artist Name'],
        duration: 180,
        album: 'Album Name',
        url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      }
      const imported = await window.vkspot.importCollection({
        name: 'Inspector test',
        origin: 'Synthetic test',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ id: 'vk_1', artist: 'Artist Name', title: 'Song Title', duration: 180 }],
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const c = state.value.collections[0]
      await window.vkspot.patchRows(c.id, [c.rows[0].id], {
        candidates: [candidate],
        searchedQuery: 'Artist Name Song Title',
        destination: 'spotify',
        spotify: candidate,
      })
    })

    await openLibrary(page)
    await expect(page.getByRole('table')).toBeVisible()

    // 1. Column resizer handles are visible in table header
    const resizers = page.locator('.table-column-resizer')
    await expect(resizers.first()).toBeVisible()

    // 2. Open row inspector by clicking row
    const row = page.getByRole('row', { name: /Запись 1:/ })
    await row.click()

    const inspector = page.locator('.inspector')
    await expect(inspector).toBeVisible()
    await expect(inspector).toHaveClass(/layout-parallel/)

    // 3. Selection bar and Reset Decision button
    const resetBtn = page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Сбросить решение', exact: true })
    await expect(resetBtn).toBeVisible()
    await expect(resetBtn).toContainText('Сбросить решение')

    // 4. Toggle layout to sequential and back to parallel
    const seqBtn = page.getByTitle('Последовательное отображение (друг под другом)')
    await expect(seqBtn).toBeVisible()
    await seqBtn.click()
    await expect(inspector).toHaveClass(/layout-sequential/)

    const parBtn = page.getByTitle('Параллельное отображение (VK и Spotify рядом)')
    await parBtn.click()
    await expect(inspector).toHaveClass(/layout-parallel/)

    // 5. Candidate audio preview button inside inspector
    const candidateListenBtn = inspector.locator('.candidate .audio-listen-button')
    await expect(candidateListenBtn).toBeVisible()
    await expect(candidateListenBtn).toContainText('Слушать')
    await candidateListenBtn.click()
    await expect(inspector.locator('.candidate .spotify-embed-card iframe')).toBeVisible()

    // 6. Reset decision clears destination to unresolved
    await resetBtn.click()
    await expect(row).toContainText('Нужен выбор')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('empty search explains the saved query and an individual local-file decision survives undo and restart', async () => {
  const directory = await createTestProfile('vkspot-review-local-decision-')
  let app = await launch(directory)
  try {
    let page = await app.firstWindow()
    const original = await page.evaluate(async () => {
      const imported = await window.vkspot.importCollection({
        name: 'Local decision fixture',
        origin: 'Synthetic',
        completeness: { expected: 2, status: 'verified-count', message: 'Test only' },
        tracks: [
          { artist: 'Artist', title: 'Rare remix', duration: 180 },
          { artist: 'Artist', title: 'Not searched', duration: 180 },
        ],
      } as never)
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections[0]
      const patched = await window.vkspot.patchRows(collection.id, [collection.rows[0].id], {
        searchedQuery: 'Artist Rare remix',
        candidates: [],
      })
      if (!patched.ok) throw new Error(patched.error)
      return collection
    })
    await openLibrary(page)
    await expect(
      page.getByRole('row', { name: 'Запись 1: Rare remix', exact: true }),
    ).toContainText('Ничего не найдено')
    await expect(
      page.getByRole('row', { name: 'Запись 2: Not searched', exact: true }),
    ).toContainText('Не искали')
    await page
      .getByRole('combobox', { name: 'Результат поиска', exact: true })
      .selectOption('missing')
    await page.getByRole('row', { name: 'Запись 1: Rare remix', exact: true }).click()
    const inspector = page.locator('.inspector')
    await expect(inspector.locator('.candidate-empty')).toContainText(
      'Последний запрос: Artist Rare remix',
    )
    await expect(inspector.locator('.candidate-empty')).toContainText(
      'Пустой ответ не означает, что трека нет в Spotify',
    )
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Нужен локальный файл', exact: true })
      .click()
    await expect(inspector.locator('.destination-state')).toContainText('ожидает привязки')
    await mkdir('.local/evidence/decisions', { recursive: true })
    await page.screenshot({ path: '.local/evidence/decisions/desktop.png' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(940, 640),
    )
    await page.screenshot({ path: '.local/evidence/decisions/compact.png' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 920),
    )
    await expect(
      page.getByRole('row', { name: 'Запись 1: Rare remix', exact: true }),
    ).toContainText('Нужен файл')
    await expect(page.getByRole('combobox', { name: 'Результат поиска', exact: true })).toHaveValue(
      'missing',
    )
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await expect(inspector.locator('.destination-state')).toContainText('не выбрано')
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Нужен локальный файл', exact: true })
      .click()
    await app.close()
    app = await launch(directory)
    page = await app.firstWindow()
    await openLibrary(page)
    await page
      .getByRole('combobox', { name: 'Статус записей', exact: true })
      .selectOption('local-pending')
    await expect(page.getByRole('row')).toHaveCount(2)
    await page.getByRole('row', { name: 'Запись 1: Rare remix', exact: true }).click()
    await expect(page.locator('.destination-state')).toContainText('ожидает привязки')
    const result = await page.evaluate(() => window.vkspot.state())
    if (!result.ok) throw new Error(result.error)
    const saved = result.value.collections[0]
    expect(saved.rows[0].working).toMatchObject({
      destination: 'unresolved',
      localPending: true,
      local: null,
      searchedQuery: 'Artist Rare remix',
      candidates: [],
    })
    expect(saved.rows.map((row) => row.source)).toEqual(original.rows.map((row) => row.source))
    expect(saved.sourceHash).toBe(original.sourceHash)
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Разобрать позже', exact: true })
      .click()
    await expect(page.locator('.destination-state')).toContainText('разобрать позже')
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Сбросить решение', exact: true })
      .click()
    await expect(page.locator('.destination-state')).toContainText('не выбрано')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
