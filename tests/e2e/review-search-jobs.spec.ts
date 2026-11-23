import { expect, test } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  connectMockSpotifySearch,
  getAppState,
  importSyntheticCollection,
  makeSpotifyCandidate,
  releaseHeldSearch,
  updateAppSettings,
} from './mocks'
import { confirmMatches, openLibrary } from './navigation'
import { setWindowContentSize, withTestApp } from './support'

test('collection runs a resumable background search without switching to jobs or confirming versions', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    await connectMockSpotifySearch(app, { holdSearch: false })
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Background fixture',
      completeness: { expected: 4, status: 'unverified', message: 'Test only' },
      tracks: Array.from({ length: 4 }, (_, i) => ({ artist: 'Artist', title: `Song ${i}` })),
    })
    await openLibrary(page)
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
    const state = await getAppState(page)
    expect(
      state.collections[0].rows
        .slice(0, 3)
        .every(
          (row) => row.working.destination === 'unresolved' && row.working.searchedQuery !== null,
        ),
    ).toBe(true)
    expect(state.collections[0].rows[3].working.searchedQuery).toBeNull()
    expect(state.collections[0].rows[3].working.localPending).toBe(true)
    expect(state.jobs[0].backgroundSearch).toBe(true)
    expect(state.jobs[0].state).toBe('complete')
  })
})

test('resumed search keeps decisions and repeated pause available, including after restart', async () => {
  await withTestApp('vkspot-review-', async (ctx) => {
    let app = ctx.app
    await connectMockSpotifySearch(app)
    let page = await app.firstWindow()
    const imported = await importSyntheticCollection(page, {
      name: 'Resume regression',
      tracks: ['Ready (Remix)', 'Hold 1', 'Hold 2', 'Hold 3'].map((title) => ({
        artist: 'Artist',
        title,
        duration: 180,
      })),
    })
    await page.evaluate(
      async ({ collectionId, rowId, candidate }) => {
        await window.vkspot.patchRows(collectionId, [rowId], {
          candidates: [candidate],
          searchedQuery: 'Artist Ready (Remix)',
        })
      },
      {
        collectionId: imported.id,
        rowId: imported.rows[0].id,
        candidate: makeSpotifyCandidate({ title: 'Ready (Remix)', album: '' }),
      },
    )
    await openLibrary(page)
    await page.getByRole('button', { name: 'Фоновый поиск (3)', exact: true }).click()
    const pause = page.getByRole('button', { name: 'Пауза поиска', exact: true })
    await pause.click()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await releaseHeldSearch(app)
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(pause).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Коллекции', exact: true })).toBeEnabled()
    await page.getByRole('row').nth(1).click()
    await page.locator('.candidate').getByRole('button', { name: 'Выбрать', exact: true }).click()
    const state = await getAppState(page)
    expect(state.collections[0].rows[0].working.destination).toBe('spotify')
    expect(state.jobs[0].state).toBe('running')
    await pause.click()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await releaseHeldSearch(app)
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(pause).toBeEnabled()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    // Close during a request. Remove only the synthetic token before restarting
    // so startup cannot send a real request before the test installs its mock.
    await ctx.close()
    await rm(join(ctx.directory, 'spotify.enc'), { force: true })
    app = await ctx.relaunch()
    page = await app.firstWindow()
    await connectMockSpotifySearch(app)
    await openLibrary(page)
    await expect(page.getByRole('button', { name: 'Продолжить поиск', exact: true })).toBeEnabled()
    const restored = await getAppState(page)
    expect(restored.jobs[0].cursor).toBe(2)
    expect(restored.collections[0].rows[0].working.destination).toBe('spotify')
    await page.getByRole('button', { name: 'Продолжить поиск', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Пауза поиска', exact: true })).toBeEnabled()
    await expect
      .poll(() => app.evaluate(() => typeof Reflect.get(globalThis, '__releaseSearch')))
      .toBe('function')
    await releaseHeldSearch(app)
    await expect(page.getByText('Поиск завершён · 3 / 3', { exact: true })).toBeVisible()
  })
})

test('unavailable background search explains the connection requirement on hover and keyboard focus', async () => {
  await withTestApp('vkspot-review-', async ({ app }) => {
    const page = await app.firstWindow()
    await importSyntheticCollection(page, {
      name: 'Hint fixture',
      tracks: [{ artist: 'Artist', title: 'Song' }],
    })
    await openLibrary(page)
    await updateAppSettings(page, { searchProvider: 'api' })
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
  })
})

test('Spotify quota wait preserves candidates, explains the deadline and unlocks manual continuation', async () => {
  await withTestApp('vkspot-review-', async ({ app, directory }) => {
    await connectMockSpotifySearch(app)
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
    await importSyntheticCollection(page, {
      name: 'Quota fixture',
      tracks: ['Plain Song', 'Limited Song'].map((title) => ({
        artist: 'Artist',
        title,
        duration: 180,
      })),
    })
    await openLibrary(page)
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
    await setWindowContentSize(app, 1000, 760)
    await updateAppSettings(page, { theme: 'dark' })
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
    // No window.vkspot API can shorten the 11760s server Retry-After deadline;
    // update only the stored retryAt directly and exercise the real UI clock.
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
    const result = await getAppState(page)
    expect(result.jobs[0].cursor).toBe(2)
    expect(result.jobs[0].retryAt).toBeUndefined()
    expect(result.collections[0].rows[0].working.spotify?.title).toBe('Plain Song')
    expect(await app.evaluate(() => Reflect.get(globalThis, '__searchCalls'))).toBe(3)
  })
})

test('automatic search is on by default, respects Spotify wait and supports a persistent off switch', async () => {
  await withTestApp('vkspot-review-', async (ctx) => {
    let app = ctx.app
    let page = await app.firstWindow()
    const initial = await getAppState(page)
    expect(initial.settings.autoResumeSearch).toBe(true)
    await connectMockSpotifySearch(app, { autoResumeSearch: true })
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
    await importSyntheticCollection(page, {
      name: 'Automatic fixture',
      tracks: [{ artist: 'Artist', title: 'Song' }],
    })
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
    await ctx.close()
    await rm(join(ctx.directory, 'spotify.enc'), { force: true })
    app = await ctx.relaunch()
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: 'Автоматически продолжать фоновый поиск', exact: true }),
    ).not.toBeChecked()
    const state = await getAppState(page)
    expect(state.settings.autoResumeSearch).toBe(false)
    expect(state.collections[0].rows[0].working.searchedQuery).toBe('Artist Song')
  })
})
