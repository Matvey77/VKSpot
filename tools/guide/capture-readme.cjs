// Actual UI, synthetic records, no service login or network-dependent actions.
// Run after `npm run build`; optionally set VKSPOT_TEST_EXECUTABLE to a packaged EXE.
const { _electron, expect } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profileRoot = path.join(root, '.local/tmp')
  await fs.mkdir(profileRoot, { recursive: true })
  const profile = await fs.mkdtemp(path.join(profileRoot, 'readme-profile-'))
  const assets = path.join(root, 'docs/images')
  const env = { ...process.env, VKSPOT_DATA_DIR: profile, VKSPOT_BACKGROUND_TEST: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  let app
  try {
    const executablePath = process.env.VKSPOT_TEST_EXECUTABLE
    app = await _electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: executablePath ? [] : [root],
      env,
    })
    const page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 940),
    )
    await page.waitForSelector('h1')
    await page.evaluate(async () => {
      const check = (result) => {
        if (!result.ok) throw new Error(result.error)
        return result.value
      }
      check(
        await window.vkspot.importCollection({
          name: 'Демо · моя музыка из VK',
          origin: 'Вымышленная коллекция для README',
          completeness: { expected: 8, status: 'verified-count', message: 'Синтетический пример' },
          tracks: [
            { artist: 'Демо-группа', title: 'Северный свет (Remix)', duration: 215 },
            { artist: 'Пример исполнителя', title: 'Тихий город', duration: 198 },
            { artist: 'Демо-дуэт', title: 'После дождя (Live)', duration: 242 },
            { artist: 'Демо-группа', title: 'Северный свет (Remix)', duration: 215 },
            { artist: 'Пример исполнителя', title: 'Старая запись', duration: 176 },
            { artist: 'Демо-группа', title: 'Ночная дорога', duration: 204 },
            { artist: 'Демо-дуэт', title: 'Между строк', duration: 189 },
            { artist: 'Демо-группа', title: 'Новый день', duration: 223 },
          ],
        }),
      )
      const state = check(await window.vkspot.state())
      const collection = state.collections[0]
      for (const [index, row] of collection.rows.entries()) {
        const candidate = {
          uri: 'spotify:track:' + String(index + 1).padStart(22, '0'),
          url: '',
          title: row.source.title,
          artists: [row.source.artist],
          album: 'Демонстрационный альбом',
          duration: row.source.duration,
        }
        check(
          await window.vkspot.patchRows(collection.id, [row.id], {
            ...(index !== 7 ? { searchedQuery: `${row.source.artist} ${row.source.title}` } : {}),
            candidates:
              index === 0
                ? [candidate, { ...candidate, title: 'Северный свет', duration: 203 }]
                : index < 4
                  ? [candidate]
                  : [],
            ...([1, 3].includes(index) ? { spotify: candidate, destination: 'spotify' } : {}),
            ...(index === 2 ? { localPending: true } : {}),
            ...(index === 4 ? { excluded: true } : {}),
            ...(index === 6 ? { reviewDeferred: true } : {}),
          }),
        )
      }
    })
    await page.getByRole('button', { name: 'Коллекции', exact: true }).click()
    await page.locator('.collection-card').first().getByRole('button', { name: 'Открыть' }).click()
    await page.getByRole('row', { name: 'Запись 1: Северный свет (Remix)', exact: true }).click()
    await expect(page.locator('.inspector')).toBeVisible()
    await fs.mkdir(assets, { recursive: true })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        const state = await window.vkspot.state()
        if (!state.ok) throw new Error(state.error)
        const result = await window.vkspot.saveSettings({ ...state.value.settings, theme })
        if (!result.ok) throw new Error(result.error)
      }, theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.screenshot({
        path: path.join(assets, `workspace-${theme}.png`),
        animations: 'disabled',
      })
    }
    process.stdout.write(
      'Captured README workspace in light and dark themes (synthetic profile).\n',
    )
  } finally {
    try {
      if (app) await app.close()
    } finally {
      if (
        path.dirname(profile) !== profileRoot ||
        !path.basename(profile).startsWith('readme-profile-')
      )
        throw new Error('Unsafe README profile cleanup target')
      await fs.rm(profile, { recursive: true, force: true })
    }
  }
})().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
