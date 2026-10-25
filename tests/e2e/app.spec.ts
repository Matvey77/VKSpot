import { openLibrary } from './navigation'
import { test, expect } from '@playwright/test'
import { writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanupTestProfile, createTestProfile, launchTestApp } from './support'

const cleanup = (directory: string) => cleanupTestProfile(directory, 'vkspot-')

test('archive, corrections, repeats, exclusion, undo, restart and settings', async () => {
  const directory = await createTestProfile('vkspot-e2e-')
  let app = await launchTestApp(directory)
  try {
    let page = await app.firstWindow()
    await openLibrary(page)
    await expect(page.getByRole('heading', { name: 'Коллекции' })).toBeVisible()
    const preview = {
      name: 'Проверочная коллекция',
      origin: 'Test fixture',
      completeness: { expected: 3, status: 'verified-count', message: 'Test fixture only' },
      tracks: [
        {
          id: 'vk1',
          artist: 'Автор',
          title: 'Песня (Remix)',
          duration: 180,
          availability: 'available',
          url: '',
          rawText: 'original 1',
        },
        {
          id: 'vk1',
          artist: 'Автор',
          title: 'Песня (Remix)',
          duration: 180,
          availability: 'available',
          url: '',
          rawText: 'original 2',
        },
        {
          id: 'vk2',
          artist: 'Другой автор',
          title: 'Недоступная запись',
          duration: 200,
          availability: 'blocked',
          url: '',
          rawText: 'original 3',
        },
      ],
    }
    const imported = await page.evaluate(
      (preview) => window.vkspot.importCollection(preview as never),
      preview,
    )
    expect(imported.ok).toBe(true)
    await openLibrary(page)
    await expect(page.getByRole('heading', { name: 'Проверочная коллекция' })).toBeVisible()
    await page.getByRole('row', { name: 'Запись 1: Песня (Remix)', exact: true }).click()
    await page.getByLabel('Название', { exact: true }).fill('Исправленная песня')
    await page.getByRole('row', { name: 'Запись 2: Песня (Remix)', exact: true }).click()
    await page.getByRole('row', { name: 'Запись 1: Песня (Remix)', exact: true }).click()
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Исправленная песня')
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await openLibrary(page)
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Исправленная песня')
    await page.getByRole('button', { name: 'Сохранить правки' }).click()
    await expect(
      page.getByRole('row', { name: 'Запись 1: Исправленная песня', exact: true }),
    ).toBeVisible()
    await page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Исключить', exact: true })
      .click()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows).toHaveLength(3)
    expect(state.value.collections[0].rows[0].source.title).toBe('Песня (Remix)')
    expect(state.value.collections[0].rows[0].working.excluded).toBe(true)
    await page.getByRole('button', { name: 'Отменить последнюю правку' }).click()
    await expect
      .poll(async () => {
        const result = await page.evaluate(() => window.vkspot.state())
        if (!result.ok) throw new Error(result.error)
        return result.value.collections[0].rows[0].working.excluded
      })
      .toBe(false)
    await app.close()
    app = await launchTestApp(directory)
    page = await app.firstWindow()
    await openLibrary(page)
    await expect(page.getByRole('heading', { name: 'Проверочная коллекция' })).toBeVisible()
    await expect(
      page.getByRole('row', { name: 'Запись 1: Исправленная песня', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Найти запись').fill('Недоступная')
    await expect(
      page.getByRole('row', { name: 'Запись 3: Недоступная запись', exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: '.local/evidence/e2e/collection-test.png', fullPage: true })
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.getByRole('tab', { name: 'Оформление', exact: true }).click()
    await page.getByLabel('Тема интерфейса').selectOption('dark')
    await page.getByRole('button', { name: 'Сохранить настройки' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('native file import and export, local audio checksum and copying', async () => {
  const directory = await createTestProfile('vkspot-files-')
  const app = await launchTestApp(directory)
  try {
    const input = join(directory, 'tracks.json'),
      archive = join(directory, 'archive.json')
    await writeFile(
      input,
      JSON.stringify([
        { artist: 'Test', title: 'Silence', duration: 1 },
        { artist: 'Test', title: 'Unresolved catalog entry', duration: 180 },
      ]),
    )
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, input)
    const page = await app.firstWindow()
    await openLibrary(page)
    await page.getByRole('button', { name: 'Импорт списка', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByRole('checkbox', { name: 'Начать поиск после сохранения', exact: true })
      .uncheck()
    await page.getByRole('button', { name: 'Сохранить 2 записей' }).click()
    await expect(page.getByRole('row', { name: 'Запись 1: Silence', exact: true })).toBeVisible()
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, archive)
    await page.getByRole('button', { name: 'Коллекции', exact: true }).click()
    await page
      .getByRole('button', { name: /Параметры коллекции «/ })
      .first()
      .click()
    await page.getByRole('button', { name: 'Сохранить резервную копию', exact: false }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено:' })).toBeVisible()
    const backup = JSON.parse(await readFile(archive, 'utf8'))
    expect(backup.collection.rows[0].source.title).toBe('Silence')
    await openLibrary(page)
    const wav = Buffer.alloc(44 + 16000)
    wav.write('RIFF')
    wav.writeUInt32LE(wav.length - 8, 4)
    wav.write('WAVE', 8)
    wav.write('fmt ', 12)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(8000, 24)
    wav.writeUInt32LE(16000, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(16000, 40)
    const audio = join(directory, 'silence.wav')
    await writeFile(audio, wav)
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, audio)
    await page.getByRole('row', { name: 'Запись 1: Silence', exact: true }).click()
    await page.getByRole('button', { name: 'Привязать файл', exact: true }).click()
    await expect(page.getByText(audio, { exact: true })).toBeVisible()
    await page.evaluate(async () => {
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const c = state.value.collections[0]
      await window.vkspot.patchRows(c.id, [c.rows[0].id], {
        spotify: {
          uri: 'spotify:track:' + 'a'.repeat(22),
          title: 'Retained alternative',
          artists: ['Test'],
          album: '',
          duration: 1,
          url: '',
        },
      })
    })
    await expect(page.locator('.destination-state')).toHaveText(
      'Текущее назначение: локальный файл',
    )
    await expect(page.locator('.retained-match')).toContainText('Сохранённый вариант Spotify')
    await expect(page.locator('.local-info')).toContainText('Выбран локальный файл')
    await page.screenshot({
      path: '.local/evidence/e2e/destination-alternatives-test.png',
      fullPage: true,
    })
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, directory)
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    const copied = await page.evaluate(
      (id) => window.vkspot.prepareLocal(id),
      state.value.collections[0].id,
    )
    if (!copied.ok) throw new Error(copied.error)
    const plan = JSON.parse(await readFile(join(copied.value!, 'transfer-plan.json'), 'utf8'))
    expect(plan.fullPlan).toHaveLength(2)
    expect(plan.fullPlan[1].destination).toBe('unresolved')
    expect(plan.local).toHaveLength(1)
    expect(await readFile(plan.local[0].preparedPath)).toEqual(wav)
    expect((await stat(plan.local[0].preparedPath)).size).toBe(wav.length)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('9000 occurrence collection stays complete and renders bounded rows', async () => {
  const directory = await createTestProfile('vkspot-large-')
  const app = await launchTestApp(directory)
  try {
    const page = await app.firstWindow()
    await openLibrary(page)
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Демонстрационная коллекция · 9000',
        origin: 'Синтетический тест, не данные пользователя',
        completeness: {
          expected: 9000,
          status: 'verified-count',
          message: 'Синтетическая проверка количества',
        },
        tracks: Array.from({ length: 9000 }, (_, i) => ({
          id: 'repeat-' + (i % 50),
          artist: i % 3 ? 'Проверочный исполнитель' : 'Автор ремикса',
          title: `Тестовая запись ${i + 1}${i % 3 ? '' : ' (Cover / Remix)'}`,
          duration: 180 + (i % 100),
          availability: i % 9 === 0 ? 'blocked' : 'available',
          url: '',
          rawText: '',
        })),
      }),
    )
    await openLibrary(page)
    await expect(
      page.getByRole('heading', { name: 'Демонстрационная коллекция · 9000' }),
    ).toBeVisible()
    expect(await page.getByRole('row').count()).toBeLessThan(80)
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows).toHaveLength(9000)
    expect(new Set(state.value.collections[0].rows.map((r) => r.id)).size).toBe(9000)
    await page
      .getByRole('row', { name: 'Запись 1: Тестовая запись 1 (Cover / Remix)', exact: true })
      .click()
    await page.screenshot({ path: '.local/evidence/e2e/large-desktop-test.png', fullPage: true })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1000, 760)
    })
    await page.screenshot({ path: '.local/evidence/e2e/compact-desktop-test.png', fullPage: true })
    await page.getByRole('button', { name: 'Закрыть запись' }).click()
    await page.getByLabel('Найти запись').fill('Тестовая запись 9000')
    await expect(
      page.getByRole('row', { name: 'Запись 9000: Тестовая запись 9000', exact: true }),
    ).toBeVisible()
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('exclusion action stays disabled while saving and preserves the row after a rejected save', async () => {
  const directory = await createTestProfile('vkspot-e2e-')
  const app = await launchTestApp(directory)
  try {
    const page = await app.firstWindow()
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Exclusion regression',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await openLibrary(page)
    await page.getByRole('row', { name: 'Запись 1: Song', exact: true }).click()
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('vkspot:patchRows')
      ipcMain.handle(
        'vkspot:patchRows',
        () =>
          new Promise((resolve) =>
            Reflect.set(globalThis, '__rejectPatch', () =>
              resolve({ ok: false, error: 'Synthetic write rejection' }),
            ),
          ),
      )
    })
    const exclude = page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Исключить', exact: true })
    await exclude.click()
    await expect(exclude).toBeDisabled()
    await app.evaluate(() => Reflect.get(globalThis, '__rejectPatch')())
    await expect(exclude).toBeEnabled()
    await expect(page.getByRole('alert')).toContainText('Synthetic write rejection')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[0].working.excluded).toBe(false)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
