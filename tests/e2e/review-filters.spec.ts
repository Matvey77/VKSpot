import { expect, test } from '@playwright/test'
import {
  getAppState,
  importSyntheticCollection,
  makeSpotifyCandidate,
  updateAppSettings,
} from './mocks'
import { confirmMatches, openLibrary } from './navigation'
import { setWindowContentSize, withTestApp } from './support'

test('review confirms repeated metadata matches, advances through versions and preserves file obligations', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    const page = await app.firstWindow()
    const imported = await importSyntheticCollection(page, {
      name: 'Review fixture',
      completeness: { expected: 5, status: 'unverified', message: 'Test only' },
      tracks: [
        { id: 'repeat', artist: 'Artist', title: 'Plain Song', duration: 181 },
        { id: 'repeat', artist: 'Artist', title: 'Plain Song', duration: 181 },
        { id: 'edit', artist: 'Artist', title: 'Song [DJ edit]', duration: 180 },
        { id: 'missing', artist: 'Artist', title: 'Unknown', duration: 120 },
        { id: 'later', artist: 'Artist', title: 'Later Song (Remix)', duration: 180 },
      ],
    })
    await page.evaluate(
      async ({ collectionId, rows }) => {
        for (const [index, row] of rows.entries()) {
          const candidate = {
            uri: 'spotify:track:' + (index < 2 ? 'a' : 'b').repeat(22),
            title: index < 2 ? 'Plain Song' : index === 2 ? 'Song' : 'Later Song',
            artists: ['Artist'],
            duration: 180,
            url: '',
            album: 'Test',
          }
          await window.vkspot.patchRows(collectionId, [row.id], {
            candidates: index === 3 ? [] : [candidate],
            searchedQuery: `${row.working.artist} ${row.working.title}`,
          })
        }
      },
      { collectionId: imported.id, rows: imported.rows },
    )

    await openLibrary(page)
    await confirmMatches(page)
    let state = await getAppState(page)
    expect(
      state.collections[0].rows.slice(0, 2).every((row) => row.working.destination === 'spotify'),
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
    await page.getByLabel('Решение о переносе', { exact: true }).selectOption('local-pending')
    await expect(page.getByRole('row')).toHaveCount(3)
    await setWindowContentSize(app, 1000, 760)
    await page.screenshot({ path: '.local/evidence/e2e/review-files-compact.png' })
    await updateAppSettings(page, { theme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({
      path: '.local/evidence/e2e/review-files-dark.png',
      animations: 'disabled',
    })
    state = await getAppState(page)
    const collection = state.collections.find((item) => item.id === imported.id)!
    expect(collection.rows).toHaveLength(5)
    expect(collection.rows[2].source.title).toBe('Song [DJ edit]')
    expect(collection.rows[2].working.localPending).toBe(true)
    expect(collection.rows[2].working.destination).toBe('unresolved')
    expect(collection.rows[4].working.destination).toBe('spotify')
    expect(collection.rows[0].working.spotify?.uri).toBe(collection.rows[1].working.spotify?.uri)
  })
})

test('collection filters preserve the visible table and support keyboard focus', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Keyboard fixture',
      completeness: { expected: 1, status: 'unverified', message: 'Test only' },
      tracks: [{ artist: 'Artist', title: 'Song' }],
    })
    await openLibrary(page)
    const filter = page.getByRole('combobox', { name: 'Результат поиска' })
    const isMac = (await app.evaluate(() => process.platform)) === 'darwin'
    const chooseResult = async (end: boolean) => {
      await filter.focus()
      if (isMac) {
        // The native macOS menu does not accept these synthetic keyboard events.
        await filter.selectOption(end ? 'missing' : 'all')
      } else {
        await page.keyboard.press(end ? 'End' : 'Home')
        await page.keyboard.press('Enter')
      }
    }
    await chooseResult(true)
    await expect(filter).toHaveValue('missing')
    await expect(page.getByRole('table')).toBeVisible()
    await chooseResult(false)
    await expect(filter).toHaveValue('all')
    await expect(page.getByRole('row', { name: 'Запись 1: Song', exact: true })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /Выделить выборку/ })).toBeFocused()
  })
})

test('table opens first, filters statuses and confirms an entire virtualized matching selection with undo', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    const page = await app.firstWindow()
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
    const imported = await importSyntheticCollection(page, {
      name: 'Status table',
      tracks,
    })
    const candidate = makeSpotifyCandidate({ title: 'Plain Song', album: '' })
    await page.evaluate(
      async ({ collectionId, rowIds, candidate }) => {
        await window.vkspot.patchRows(
          collectionId,
          rowIds.filter((_, i) => i < 2 || i >= 9),
          { candidates: [candidate], searchedQuery: 'Artist Plain Song' },
        )
        await window.vkspot.patchRows(collectionId, [rowIds[2]], {
          candidates: [{ ...candidate, title: 'Version' }],
          searchedQuery: 'Artist Version (Remix)',
        })
        await window.vkspot.patchRows(collectionId, [rowIds[3]], {
          candidates: [],
          searchedQuery: 'Artist Missing',
        })
        await window.vkspot.patchRows(collectionId, [rowIds[5]], { localPending: true })
        await window.vkspot.patchRows(collectionId, [rowIds[6]], { reviewDeferred: true })
        await window.vkspot.patchRows(collectionId, [rowIds[7]], {
          spotify: candidate,
          destination: 'spotify',
        })
        await window.vkspot.patchRows(collectionId, [rowIds[8]], { excluded: true })
      },
      {
        collectionId: imported.id,
        rowIds: imported.rows.map((row) => row.id),
        candidate,
      },
    )
    const original = {
      id: imported.id,
      hash: imported.sourceHash,
      ids: imported.rows.map((row) => row.id),
    }

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
    await setWindowContentSize(app, 1000, 760)
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
    const confirmed = await getAppState(page)
    expect(
      confirmed.collections[0].rows.filter((row) => row.working.destination === 'spotify'),
    ).toHaveLength(1503)
    expect(confirmed.collections[0].sourceHash).toBe(original.hash)
    expect(confirmed.collections[0].rows.map((row) => row.id)).toEqual(original.ids)
    await expect(page.locator('.selection-bar')).toHaveCount(0)
    await page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }).click()
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByLabel('Решение о переносе', { exact: true }).selectOption('excluded')
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
  })
})
