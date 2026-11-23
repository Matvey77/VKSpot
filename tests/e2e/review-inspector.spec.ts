import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import {
  getAppState,
  importSyntheticCollection,
  makeSpotifyCandidate,
  updateAppSettings,
} from './mocks'
import { openLibrary } from './navigation'
import { setWindowContentSize, withTestApp } from './support'

test('independent filters, exposed decisions and manual Spotify links preserve source, undo and restart', async () => {
  await withTestApp('vkspot-review-', async (ctx) => {
    let app = ctx.app
    let page = await app.firstWindow()
    await page.route('https://open.spotify.com/embed/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Spotify preview</p>' }),
    )
    const original = await importSyntheticCollection(page, {
      name: 'Decision fixture',
      origin: 'Synthetic',
      tracks: [
        { artist: 'Artist', title: 'Song One', duration: 180 },
        { artist: 'Artist', title: 'Song Two', duration: 180 },
        { artist: 'Artist', title: 'Need file', duration: 180 },
        { artist: 'Artist', title: 'Worldwide', duration: 89 },
      ],
    })
    await page.evaluate(
      async ({ collectionId, rows }) => {
        for (const [index, row] of rows.entries()) {
          const candidate = {
            uri: 'spotify:track:' + 'a'.repeat(22),
            url: '',
            title: row.working.title,
            artists: ['Artist'],
            duration: 180,
            album: 'Synthetic',
          }
          await window.vkspot.patchRows(collectionId, [row.id], {
            searchedQuery: `${row.working.artist} ${row.working.title}`,
            candidates: index < 2 ? [candidate] : [],
            ...(index === 1 ? { spotify: candidate, destination: 'spotify' as const } : {}),
            ...(index === 2 ? { localPending: true } : {}),
          })
        }
      },
      { collectionId: original.id, rows: original.rows },
    )

    await openLibrary(page)
    const resultFilter = page.getByRole('combobox', { name: 'Результат поиска', exact: true })
    const decisionFilter = page.getByRole('combobox', { name: 'Решение о переносе', exact: true })
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
      await updateAppSettings(page, { theme })
      for (const width of [1440, 940]) {
        await setWindowContentSize(app, width, 900)
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
    app = await ctx.relaunch()
    page = await app.firstWindow()
    const state = await getAppState(page)
    expect(state.collections[0].rows[3].working).toMatchObject({
      destination: 'spotify',
      spotify: {
        title: 'Worldwide (Original)',
        uri: 'spotify:track:' + 'b'.repeat(22),
        duration: 89,
      },
      candidates: [],
      searchedQuery: 'Artist Worldwide',
    })
    expect(state.collections[0].sourceHash).toBe(original.sourceHash)
    expect(state.collections[0].rows.map((row) => row.source)).toEqual(
      original.rows.map((row) => row.source),
    )
    expect(state.collections[0].rows[0].working.excluded).toBe(false)
  })
})

test('in-app audio comparison controls are available for VK source and Spotify candidates', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    const page = await app.firstWindow()
    const imported = await importSyntheticCollection(page, {
      name: 'Audio review fixture',
      completeness: { expected: 1, status: 'unverified', message: 'Test only' },
      tracks: [{ id: 'vk_123', artist: 'Test Artist', title: 'Test Song', duration: 180 }],
    })
    await page.evaluate(
      async ({ collectionId, rowId, candidate }) => {
        await window.vkspot.patchRows(collectionId, [rowId], {
          candidates: [candidate],
          searchedQuery: 'Test Artist Test Song',
        })
      },
      {
        collectionId: imported.id,
        rowId: imported.rows[0].id,
        candidate: makeSpotifyCandidate({
          uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
          title: 'Test Song',
          artists: ['Test Artist'],
          url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
          album: 'Test Album',
        }),
      },
    )

    await openLibrary(page)
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
  })
})

test('table inspector supports resizing, layout toggle (parallel/sequential), reset decision and candidate audio preview', async () => {
  await withTestApp('vkspot-review-inspector-', async ({ app }) => {
    const page = await app.firstWindow()
    const imported = await importSyntheticCollection(page, {
      name: 'Inspector test',
      tracks: [{ id: 'vk_1', artist: 'Artist Name', title: 'Song Title', duration: 180 }],
    })
    await page.evaluate(
      async ({ collectionId, rowId, candidate }) => {
        await window.vkspot.patchRows(collectionId, [rowId], {
          candidates: [candidate],
          searchedQuery: 'Artist Name Song Title',
          destination: 'spotify',
          spotify: candidate,
        })
      },
      {
        collectionId: imported.id,
        rowId: imported.rows[0].id,
        candidate: makeSpotifyCandidate({
          uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
          title: 'Song Title',
          artists: ['Artist Name'],
          album: 'Album Name',
          url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        }),
      },
    )

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
  })
})

test('empty search explains the saved query and an individual local-file decision survives undo and restart', async () => {
  await withTestApp('vkspot-review-local-decision-', async (ctx) => {
    let app = ctx.app
    let page = await app.firstWindow()
    const original = await importSyntheticCollection(page, {
      name: 'Local decision fixture',
      origin: 'Synthetic',
      tracks: [
        { artist: 'Artist', title: 'Rare remix', duration: 180 },
        { artist: 'Artist', title: 'Not searched', duration: 180 },
      ],
    })
    await page.evaluate(
      async ({ collectionId, rowId }) => {
        const patched = await window.vkspot.patchRows(collectionId, [rowId], {
          searchedQuery: 'Artist Rare remix',
          candidates: [],
        })
        if (!patched.ok) throw new Error(patched.error)
      },
      { collectionId: original.id, rowId: original.rows[0].id },
    )
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
    await setWindowContentSize(app, 940, 640)
    await page.screenshot({ path: '.local/evidence/decisions/compact.png' })
    await setWindowContentSize(app, 1440, 920)
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
    app = await ctx.relaunch()
    page = await app.firstWindow()
    await openLibrary(page)
    await page
      .getByRole('combobox', { name: 'Решение о переносе', exact: true })
      .selectOption('local-pending')
    await expect(page.getByRole('row')).toHaveCount(2)
    await page.getByRole('row', { name: 'Запись 1: Rare remix', exact: true }).click()
    await expect(page.locator('.destination-state')).toContainText('ожидает привязки')
    const result = await getAppState(page)
    const saved = result.collections[0]
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
  })
})
