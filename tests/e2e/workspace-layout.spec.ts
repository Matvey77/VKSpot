import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { openLibrary } from './navigation'

async function cleanup(directory: string): Promise<void> {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-workspace-')
  )
    throw new Error('Unsafe cleanup target')
  await rm(directory, { recursive: true, force: true })
}

test('collection workspace preserves drafts, scopes quick filters and fits desktop windows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-workspace-'))
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
  const app = await electron.launch({
    executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
    args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
    env,
  })
  try {
    const page = await app.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(async () => {
      const result = await window.vkspot.importCollection({
        name: 'Моя музыка VK',
        origin: 'Synthetic VK · проверка интерфейса',
        completeness: { expected: 120, status: 'verified-count', message: 'Synthetic fixture' },
        tracks: Array.from({ length: 120 }, (_, index) => ({
          id: `synthetic_${index}`,
          artist: ['королевский XVII', 'Monogoznaal', 'воскресенский', 'FRIENDLY THUG 52 NGG'][
            index % 4
          ],
          title: [
            'de facto de jure',
            'На берегу',
            'спираль [FLIPPER remix]',
            'Maestro & No Getcher Gang 2',
          ][index % 4],
          duration: 159 + index,
          availability: 'available',
        })),
      } as never)
      if (!result.ok) throw new Error(result.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections[0]
      for (const [index, row] of collection.rows.entries()) {
        const candidates = Array.from({ length: 3 }, (_, candidateIndex) => ({
          uri: `spotify:track:${String(index * 3 + candidateIndex).padStart(22, '0')}`,
          url: `https://open.spotify.com/track/${String(index * 3 + candidateIndex).padStart(22, '0')}`,
          title:
            candidateIndex === 0
              ? row.working.title
              : `${row.working.title} (${candidateIndex === 1 ? 'Live' : 'Remix'})`,
          artists: [row.working.artist],
          album: 'Демонстрационные данные',
          duration: row.source.duration! + candidateIndex * 12 + (index % 4 === 1 ? 20 : 0),
        }))
        const patched = await window.vkspot.patchRows(collection.id, [row.id], {
          searchedQuery: `${row.working.artist} ${row.working.title}`,
          candidates,
          ...(index > 50 ? { spotify: candidates[0], destination: 'spotify' as const } : {}),
        })
        if (!patched.ok) throw new Error(patched.error)
      }
    })
    await openLibrary(page)
    await page.getByRole('row', { name: 'Запись 1: de facto de jure', exact: true }).click()
    await page.getByLabel('Название', { exact: true }).fill('Черновик названия')
    await page.getByRole('button', { name: 'Следующая запись', exact: true }).click()
    await expect(page.locator('.inspector-track-heading')).toContainText('Запись №2')
    await expect(page.getByRole('button', { name: 'Следующая запись', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Предыдущая запись', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Следующая запись', exact: true })).toBeFocused()
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Черновик названия')
    await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
    const facets = page.getByRole('group', { name: 'Быстрые фильтры коллекции' })
    await facets.getByRole('button', { name: /^Spotify/ }).click()
    await expect(page.getByRole('combobox', { name: 'Статус записей', exact: true })).toHaveValue(
      'spotify',
    )
    await expect(page.locator('.table-panel')).toHaveAttribute('aria-rowcount', '70')
    await page.getByLabel('Найти запись', { exact: true }).fill('не существующий запрос')
    await expect(page.getByRole('heading', { name: 'Нет записей по этому запросу' })).toBeVisible()
    await facets.getByRole('button', { name: /^Все записи/ }).click()
    await expect(page.getByLabel('Найти запись', { exact: true })).toHaveValue('')
    await page.getByRole('row', { name: 'Запись 2: На берегу', exact: true }).click()
    await mkdir('.local/evidence/redesign', { recursive: true })
    for (const [width, height, name] of [
      [1440, 960, 'desktop'],
      [2560, 1400, 'user-2560'],
      [940, 640, 'compact'],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height)
        },
        { width, height },
      )
      await expect
        .poll(async () => page.locator('.table-panel').evaluate((element) => element.clientHeight))
        .toBeGreaterThan(130)
      const geometry = await page.evaluate(() => {
        const inspector = document.querySelector('.inspector')!.getBoundingClientRect()
        const table = document.querySelector('.table-panel')!.getBoundingClientRect()
        return {
          width: innerWidth,
          height: innerHeight,
          inspector: { right: inspector.right, top: inspector.top, bottom: inspector.bottom },
          table: { top: table.top, bottom: table.bottom },
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.inspector.right).toBeLessThanOrEqual(geometry.width)
      expect(geometry.inspector.bottom).toBeLessThanOrEqual(geometry.height)
      expect(geometry.inspector.top).toBeLessThan(geometry.table.top)
      await page.screenshot({ path: `.local/evidence/redesign/${name}.png` })
    }
    await expect(page.locator('.library-list-pane')).toHaveAttribute('inert', '')
    await expect(page.locator('.inspector-track-heading h2')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.inspector')).toHaveCount(0)
    await expect(page.locator('.table-row.focused')).toHaveCount(0)
    const secondRow = page.getByRole('row', { name: 'Запись 2: На берегу', exact: true })
    await expect(secondRow).toBeFocused()
    await secondRow.press('Enter')
    await expect(page.locator('.inspector-track-heading h2')).toBeFocused()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 960),
    )
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      await window.vkspot.saveSettings({ ...state.value.settings, theme: 'dark' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ path: '.local/evidence/redesign/dark.png' })
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      await window.vkspot.saveSettings({ ...state.value.settings, theme: 'light' })
    })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
    for (const [label, name] of [
      ['Коллекции', 'collections'],
      ['Подключения', 'connections'],
      ['Настройки', 'settings'],
      ['Обзор', 'start'],
    ] as const) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.screenshot({ path: `.local/evidence/redesign/${name}.png` })
    }
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
