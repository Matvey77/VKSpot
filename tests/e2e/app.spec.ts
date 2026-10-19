import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'

async function cleanup(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('vkspot-'))
    throw new Error('Unsafe test cleanup target')
  await rm(target, { recursive: true, force: true })
}

test('archive, corrections, repeats, exclusion, undo, restart and settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-e2e-'))
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
  let app = await electron.launch({
    executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
    args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
    env,
  })
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Твоя музыка, целиком' })).toBeVisible()
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
    await expect(page.getByRole('heading', { name: 'Проверочная коллекция' })).toBeVisible()
    await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
    await page.getByRole('row', { name: 'Запись 1: Песня (Remix)', exact: true }).click()
    await page.getByLabel('Название', { exact: true }).fill('Исправленная песня')
    await page.getByRole('row', { name: 'Запись 2: Песня (Remix)', exact: true }).click()
    await page.getByRole('row', { name: 'Запись 1: Песня (Remix)', exact: true }).click()
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Исправленная песня')
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
    await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Исправленная песня')
    await page.getByRole('button', { name: 'Сохранить правки' }).click()
    await expect(
      page.getByRole('row', { name: 'Запись 1: Исправленная песня', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Исключить из переноса').check()
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows).toHaveLength(3)
    expect(state.value.collections[0].rows[0].source.title).toBe('Песня (Remix)')
    expect(state.value.collections[0].rows[0].working.excluded).toBe(true)
    await page.getByRole('button', { name: 'Отменить последнюю правку' }).click()
    await expect(page.getByLabel('Исключить из переноса')).not.toBeChecked()
    await app.close()
    app = await electron.launch({
      executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
      args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
      env,
    })
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Проверочная коллекция' })).toBeVisible()
    await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
    await expect(
      page.getByRole('row', { name: 'Запись 1: Исправленная песня', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Найти запись').fill('Недоступная')
    await expect(
      page.getByRole('row', { name: 'Запись 3: Недоступная запись', exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: '.local/evidence/e2e/collection-test.png', fullPage: true })
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.getByLabel('Оформление').selectOption('dark')
    await page.getByRole('button', { name: 'Сохранить настройки' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  } finally {
    await app.close()
    await cleanup(directory)
  }
})

test('native file import and export, local audio checksum and copying', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-files-'))
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
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
    await page.getByRole('button', { name: 'Выбрать файл', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByRole('checkbox', { name: 'Начать поиск после сохранения', exact: true })
      .uncheck()
    await page.getByRole('button', { name: 'Сохранить 2 записей' }).click()
    await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
    await expect(page.getByRole('row', { name: 'Запись 1: Silence', exact: true })).toBeVisible()
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, archive)
    await page.getByRole('button', { name: 'Сохранить архив', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено:' })).toBeVisible()
    const backup = JSON.parse(await readFile(archive, 'utf8'))
    expect(backup.collection.rows[0].source.title).toBe('Silence')
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
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-large-'))
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
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
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
    await expect(
      page.getByRole('heading', { name: 'Демонстрационная коллекция · 9000' }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
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

test('exclude checkbox responds while the database is pending and rolls back a rejected save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vkspot-e2e-'))
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
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Checkbox regression',
        origin: 'Synthetic',
        completeness: { expected: 1, status: 'verified-count', message: 'Test only' },
        tracks: [{ artist: 'Artist', title: 'Song' }],
      } as never),
    )
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
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
    const checkbox = page.getByRole('checkbox', { name: 'Исключить из переноса', exact: true })
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await expect(checkbox).toBeDisabled()
    await app.evaluate(() => Reflect.get(globalThis, '__rejectPatch')())
    await expect(checkbox).not.toBeChecked()
    await expect(page.getByRole('alert')).toContainText('Synthetic write rejection')
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    expect(state.value.collections[0].rows[0].working.excluded).toBe(false)
  } finally {
    await app.close()
    await cleanup(directory)
  }
})
