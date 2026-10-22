import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

async function cleanup(directory: string): Promise<void> {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-overview-')
  )
    throw new Error('Unsafe cleanup target')
  await rm(directory, { recursive: true, force: true })
}

test('overview scopes review queues, collection exports keep their owner and settings keep drafts across sections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-overview-'))
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
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 960),
    )
    await mkdir('.local/evidence/overview-settings', { recursive: true })
    await expect(page.getByRole('heading', { name: 'Обзор', exact: true })).toBeVisible()
    await expect(page.locator('nav button')).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Архив и экспорт', exact: true })).toHaveCount(0)
    await page.screenshot({ path: '.local/evidence/overview-settings/empty.png' })
    const fixture = await page.evaluate(async () => {
      for (const name of ['Демо: разбор коллекции', 'Демо: отдельный экспорт']) {
        const imported = await window.vkspot.importCollection({
          name,
          origin: 'Synthetic UX fixture',
          completeness: {
            expected: name.includes('разбор') ? 4 : 1,
            status: 'verified-count',
            message: 'Synthetic only',
          },
          tracks: name.includes('разбор')
            ? ['Exact', 'Review', 'Missing', 'File'].map((title) => ({
                artist: 'Demo Artist',
                title,
                duration: 180,
              }))
            : [{ artist: 'B Artist', title: 'Export only B', duration: 180 }],
        } as never)
        if (!imported.ok) throw new Error(imported.error)
      }
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const main = state.value.collections.find((item) => item.name.includes('разбор'))!
      const other = state.value.collections.find((item) => item.name.includes('экспорт'))!
      for (const collection of [main, other]) {
        for (const [index, row] of collection.rows.entries()) {
          const candidate = {
            uri: 'spotify:track:' + 'b'.repeat(22),
            url: 'https://open.spotify.com/track/' + 'b'.repeat(22),
            title: row.working.title,
            artists: [row.working.artist],
            duration: index === 1 ? 240 : 180,
            album: 'Synthetic',
          }
          const patched = await window.vkspot.patchRows(collection.id, [row.id], {
            searchedQuery: `${row.working.artist} ${row.working.title}`,
            candidates: index < 2 ? [candidate] : [],
            ...(index === 3 ? { localPending: true } : {}),
            ...(collection.id === other.id
              ? { destination: 'spotify' as const, spotify: candidate }
              : {}),
          })
          if (!patched.ok) throw new Error(patched.error)
        }
      }
      return { main: main.id, other: other.id }
    })
    await page.getByLabel('Текущая коллекция', { exact: true }).selectOption(fixture.main)
    await page.screenshot({ path: '.local/evidence/overview-settings/overview.png' })
    await page
      .locator('.overview-review-list')
      .getByRole('button', { name: /Проверить версии/ })
      .click()
    await expect(page.getByRole('combobox', { name: 'Результат поиска', exact: true })).toHaveValue(
      'review',
    )
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(page.getByRole('row', { name: 'Запись 2: Review', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Обзор', exact: true }).click()
    await page
      .locator('.overview-review-list')
      .getByRole('button', { name: /Нужен локальный файл/ })
      .click()
    await expect(page.getByRole('combobox', { name: 'Статус записей', exact: true })).toHaveValue(
      'local-pending',
    )
    await expect(page.getByRole('row', { name: 'Запись 4: File', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Коллекции', exact: true }).click()
    const exportOptions = [
      ['Сохранить резервную копию', 'archive.json'],
      ['Исходный список VK', 'raw.json'],
      ['Таблица CSV', 'table.csv'],
      ['План переноса', 'plan.json'],
      ['Плейлист M3U8', 'playlist.m3u8'],
    ] as const
    for (const [name, filename] of exportOptions) {
      await page
        .getByRole('button', { name: 'Параметры коллекции «Демо: отдельный экспорт»', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toContainText('Демо: отдельный экспорт')
      if (filename === 'archive.json')
        await page.screenshot({ path: '.local/evidence/overview-settings/collection-options.png' })
      const target = join(directory, filename)
      await app.evaluate(({ dialog }, target) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
      }, target)
      await page
        .getByRole('dialog')
        .getByRole('button', { name: new RegExp('^' + name) })
        .click()
      await expect
        .poll(async () => readFile(target, 'utf8').catch(() => ''))
        .toContain(filename === 'playlist.m3u8' ? 'spotify:track:' : 'Export only B')
      const saved = await readFile(target, 'utf8')
      if (filename === 'archive.json') expect(JSON.parse(saved).collection.id).toBe(fixture.other)
      expect(saved).not.toContain('Demo Artist')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.screenshot({ path: '.local/evidence/overview-settings/settings-search.png' })
    await page.getByRole('tab', { name: 'Поиск', exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('tab', { name: 'Сопоставление', exact: true })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Хранилище', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Home')
    await expect(page.getByRole('tab', { name: 'Поиск', exact: true })).toBeFocused()
    await expect(
      page.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeDisabled()
    await page.getByRole('radio', { name: /Spotify API/ }).check()
    await page.getByRole('tab', { name: 'Перенос', exact: true }).click()
    await page.getByLabel('Название нового плейлиста', { exact: true }).fill('Draft playlist')
    await page.getByRole('tab', { name: 'Сопоставление', exact: true }).click()
    await page.screenshot({ path: '.local/evidence/overview-settings/settings-matching.png' })
    await page.getByRole('tab', { name: 'Перенос', exact: true }).click()
    await expect(page.getByLabel('Название нового плейлиста', { exact: true })).toHaveValue(
      'Draft playlist',
    )
    await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click()
    await expect(page.getByLabel('Название нового плейлиста', { exact: true })).not.toHaveValue(
      'Draft playlist',
    )
    await page.getByLabel('Название нового плейлиста', { exact: true }).fill('Saved playlist')
    await page.getByRole('tab', { name: 'Оформление', exact: true }).click()
    await page.getByLabel('Тема интерфейса', { exact: true }).selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(
      page.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeDisabled()
    const savedSettings = await page.evaluate(() => window.vkspot.state())
    if (!savedSettings.ok) throw new Error(savedSettings.error)
    expect(savedSettings.value.settings.playlistName).toBe('Saved playlist')
    expect(savedSettings.value.settings.searchProvider).toBe('browser')
    await page.getByRole('tab', { name: 'Сопоставление', exact: true }).click()
    await page.screenshot({ path: '.local/evidence/overview-settings/settings-dark.png' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(940, 640),
    )
    await expect(
      page.getByRole('button', { name: 'Сохранить настройки', exact: true }),
    ).toBeInViewport()
    await page.screenshot({ path: '.local/evidence/overview-settings/settings-compact.png' })
    await page.getByRole('button', { name: 'Обзор', exact: true }).click()
    await expect(page.getByLabel('Текущая коллекция', { exact: true })).toHaveValue(fixture.main)
    await page.screenshot({ path: '.local/evidence/overview-settings/overview-compact.png' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 960),
    )
    await page.screenshot({ path: '.local/evidence/overview-settings/overview-dark.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
