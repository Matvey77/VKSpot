import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { classicVKPage, modernVKPage } from '../fixtures/vk-pages'

const adapterPath = resolve('resources/scripts/vk-export.js')
// Exercise real layout and scrolling. Only isolated-world timeouts and its
// monotonic wait clock are accelerated; page rendering stays native Chromium.
const clock = `{
  const timeout = globalThis.setTimeout.bind(globalThis);
  const now = Date.now.bind(Date); const started = now();
  // Scroll events must update the synthetic virtual list before the next read.
  // Accelerate waiting without racing Chromium's real rendering frames.
  globalThis.setTimeout = (fn, ms) => timeout(() =>
    requestAnimationFrame(() => requestAnimationFrame(fn)), Math.max(30, ms / 16));
  Date.now = () => started + (now() - started) * 16;
}; undefined`
let directory: string
let app: ElectronApplication
const progressClock = `${clock}; {
  let now = Date.now();
  globalThis.__VKSPOT_TEST_STARTED__ = now;
  Date.now = () => (now += 15000);
}; undefined`

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vkspot-extract-'))
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
  app = await electron.launch({ args: ['.'], env })
  await app.firstWindow()
})
test.afterEach(async () => {
  await app?.close()
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-extract-')
  )
    throw new Error('Unsafe VK fixture cleanup target')
  await rm(directory, { recursive: true, force: true })
})

async function fixture(html: string, library?: string, clockScript = clock): Promise<void> {
  await app.evaluate(
    async ({ session }, { html, library }) => {
      await session
        .fromPartition('persist:vkspot-vk')
        .protocol.handle(
          'https',
          (request) =>
            new Response(
              library && new URL(request.url).pathname === '/audios42' ? library : html,
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            ),
        )
    },
    { html, library },
  )
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Подключения', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть VK', exact: true }).click()
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every(
        (window) => window.getOpacity() === 0 && !window.isFocused(),
      ),
    ),
  ).toBe(true)
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
  await app.evaluate(async ({ webContents }, code) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === 'https://vk.com/audio')!
    await contents.executeJavaScriptInIsolatedWorld(1001, [{ code }])
  }, clockScript)
}

test('modern virtualized list exports 8307 occurrences, blocked entries and exact order from the top', async () => {
  test.setTimeout(90000)
  await fixture(modernVKPage())
  const page = await app.firstWindow()
  await page.getByLabel('Число записей в VK, если известно').fill('8307')
  await page.getByRole('button', { name: 'Выгрузить мой список', exact: true }).click()
  await expect(page.getByText('Собрано', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 75000 })
  await expect(page.getByRole('dialog')).toContainText('8307 из ожидаемых 8307')
  await expect(page.getByRole('dialog')).toContainText('Автор & Гость')
  await expect(page.getByRole('dialog')).toContainText('8307')
  await expect(page.getByRole('button', { name: 'Сохранить 8 307 записей' })).toBeEnabled()
  await page.screenshot({ path: '.local/evidence/e2e/vk-complete-preview.png' })
  await page.getByRole('button', { name: 'Сохранить 8 307 записей' }).click()
  const data = await page.evaluate(() => window.vkspot.state())
  if (!data.ok) throw new Error(data.error)
  const collection = data.value.collections[0]
  expect(collection.rows).toHaveLength(8307)
  expect(collection.rows.every((row) => row.source.id === 'same-id')).toBe(true)
  expect(collection.rows[0].source.availability).toBe('blocked')
  expect(collection.rows[8306].position).toBe(8307)
  expect(collection.rows[8306].source.title).toBe('Демо (Cover / Remix)')
  expect(collection.completeness.status).toBe('verified-count')
})

test('active collection continues beyond twenty minutes while new tracks arrive', async () => {
  await fixture(modernVKPage({ total: 2400 }), undefined, progressClock)
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK())
  if (!result.ok) throw new Error(result.error)
  expect(result.value.tracks).toHaveLength(2400)
  expect(result.value.completeness.status).toBe('verified-count')
  const elapsed = await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === 'https://vk.com/audio')!
    return contents.executeJavaScriptInIsolatedWorld(1001, [
      { code: 'Date.now() - globalThis.__VKSPOT_TEST_STARTED__' },
    ])
  })
  expect(elapsed).toBeGreaterThan(20 * 60 * 1000)
})

test('a stalled scrolling surface still stops with an unverified partial list', async () => {
  await fixture(modernVKPage({ total: 600, aria: false }), undefined, progressClock)
  await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === 'https://vk.com/audio')!
    await contents.executeJavaScriptInIsolatedWorld(1001, [
      {
        code: `{
          const viewport = document.querySelector('#viewport');
          viewport.scrollTop = 0;
          viewport.scrollTo = () => {};
        }; undefined`,
      },
    ])
  })
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK())
  if (!result.ok) throw new Error(result.error)
  expect(result.value.tracks.length).toBeGreaterThan(0)
  expect(result.value.tracks.length).toBeLessThan(600)
  expect(result.value.completeness.status).toBe('unverified')
  expect(result.value.completeness.message).toContain('Достигнут предел времени')
})

test('geometry anchors preserve identical repeats without ARIA and wait past the first 398 rows', async () => {
  await fixture(modernVKPage({ total: 623, virtual: false, delayed: true, aria: false }))
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK({ expectedCount: 8001 }))
  if (!result.ok) throw new Error(result.error)
  expect(result.value.tracks).toHaveLength(623)
  expect(result.value.tracks.every((track) => track.artist === 'Автор & Гость')).toBe(true)
  expect(result.value.completeness.status).toBe('unverified')
  expect(result.value.completeness.message).toContain('623 из ожидаемых 8001')
})

test('legacy tuple/object metadata and visible version suffixes work without exporting secrets', async () => {
  await fixture(classicVKPage())
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK({ expectedCount: 3 }))
  if (!result.ok) throw new Error(result.error)
  expect(
    result.value.tracks.map((track) => [track.id, track.artist, track.title, track.duration]),
  ).toEqual([
    ['-7_11', 'Artist & Guest', 'Song & Remix', 183],
    ['-7_12', 'Own Artist', 'Own (Mashup)', 200],
    ['-7_13', 'Performer', 'Visible (Live Cover)', 3723],
  ])
  expect(result.value.tracks[0].availability).toBe('blocked')
  expect(JSON.stringify(result)).not.toMatch(/secret\.invalid|SECRET_HASH/)
})

test('blank extraction is rejected', async () => {
  await fixture(modernVKPage({ total: 3, blank: true }))
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK())
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain('названия и исполнители не прочитаны')
})

test('cancellation keeps only an explicitly unverified partial list', async () => {
  await fixture(modernVKPage())
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Выгрузить мой список', exact: true }).click()
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => {
        const contents = webContents
          .getAllWebContents()
          .find((item) => item.getURL() === 'https://vk.com/audio')!
        return contents.executeJavaScriptInIsolatedWorld(1001, [
          { code: 'globalThis.__VKSPOT_EXPORT__?.collected ?? 0' },
        ])
      }),
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Остановить сбор', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Сбор остановлен пользователем.')
  const save = page.getByRole('button', { name: 'Сохранить непроверенный список', exact: true })
  await expect(save).toBeDisabled()
  await page.screenshot({ path: '.local/evidence/e2e/vk-partial-preview.png' })
  await page.getByLabel('Сохранить как непроверенный список. Он может содержать пропуски.').check()
  await expect(save).toBeEnabled()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith('file:'))!
      .setSize(1000, 760),
  )
  await page.screenshot({ path: '.local/evidence/e2e/vk-partial-compact.png' })
  await page.evaluate(async () => {
    const result = await window.vkspot.state()
    if (result.ok) await window.vkspot.saveSettings({ ...result.value.settings, theme: 'dark' })
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: '.local/evidence/e2e/vk-partial-dark.png', animations: 'disabled' })
})

test('virtualized repeats can be collected without ARIA positions', async () => {
  await fixture(modernVKPage({ total: 401, aria: false }))
  const code = await readFile(adapterPath, 'utf8')
  const result = await app.evaluate(async ({ webContents }, code) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === 'https://vk.com/audio')!
    return contents.executeJavaScriptInIsolatedWorld(1001, [{ code }])
  }, code)
  expect(result.tracks).toHaveLength(401)
  expect(result.expectedCount).toBeNull()
  expect(result.extraction.reason).toBe('end')
})

test('a disconnected virtualized batch is reported as a gap instead of being appended', async () => {
  await fixture(modernVKPage({ total: 600, gap: true }))
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK({ expectedCount: 600 }))
  if (!result.ok) throw new Error(result.error)
  expect(result.value.tracks.length).toBeLessThan(600)
  expect(result.value.completeness.status).toBe('unverified')
  expect(result.value.completeness.message).toContain('непрерывный порядок')
})

test('catalogue home is replaced with the owned library before extraction', async () => {
  await fixture(
    '<a role="tab" aria-selected="false" data-testid="AudioCatalog_Tabs_Tab_all" href="https://vk.ru/audios42?section=all">Моя музыка</a><p>Главная</p>',
    modernVKPage({ total: 4 }),
  )
  const page = await app.firstWindow()
  const result = await page.evaluate(() => window.vkspot.extractVK())
  if (!result.ok) throw new Error(result.error)
  expect(result.value.tracks).toHaveLength(4)
  expect(result.value.completeness.status).toBe('verified-count')
})

test('closing the VK window stops extraction and releases the running guard', async () => {
  await fixture(modernVKPage())
  const page = await app.firstWindow()
  const extracting = page.evaluate(() => window.vkspot.extractVK())
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => {
        const contents = webContents
          .getAllWebContents()
          .find((item) => item.getURL() === 'https://vk.com/audio')!
        return contents.executeJavaScriptInIsolatedWorld(1001, [
          { code: 'globalThis.__VKSPOT_EXPORT__?.collected ?? 0' },
        ])
      }),
    )
    .toBeGreaterThan(0)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().startsWith('file:'))!
      .close(),
  )
  const result = await extracting
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain('Окно VK закрыто')
  const next = await page.evaluate(() => window.vkspot.extractVK())
  expect(next.ok).toBe(false)
  if (!next.ok) expect(next.error).toContain('Сначала откройте VK')
})
