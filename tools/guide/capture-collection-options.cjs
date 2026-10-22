const { _electron } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profileRoot = path.join(root, '.local/tmp')
  await fs.mkdir(profileRoot, { recursive: true })
  const profile = await fs.mkdtemp(path.join(profileRoot, 'collection-options-guide-'))
  const env = { ...process.env, VKSPOT_DATA_DIR: profile, VKSPOT_BACKGROUND_TEST: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ args: [root], env })
  const assets = path.join(root, 'src/renderer/src/assets/guide')
  try {
    const page = await app.firstWindow()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 1040),
    )
    await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Демо: моя музыка из VK',
        origin: 'Synthetic guide fixture',
        completeness: { expected: 2, status: 'verified-count', message: 'Synthetic only' },
        tracks: [
          { artist: 'Демоисполнитель', title: 'Первая запись', duration: 180 },
          { artist: 'Демоисполнитель', title: 'Редкая версия', duration: 200 },
        ],
      }),
    )
    const records = JSON.parse(
      await fs.readFile(path.join(assets, 'captures.json'), 'utf8'),
    ).filter((record) => record.key !== 'archive')
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        const state = await window.vkspot.state()
        if (!state.ok) throw new Error(state.error)
        const saved = await window.vkspot.saveSettings({ ...state.value.settings, theme })
        if (!saved.ok) throw new Error(saved.error)
      }, theme)
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme)
      await page.getByRole('button', { name: 'Коллекции', exact: true }).click()
      await page
        .getByRole('button', { name: 'Параметры коллекции «Демо: моя музыка из VK»', exact: true })
        .click()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const targets = [
        [
          'Параметры коллекции',
          page
            .getByRole('dialog')
            .getByRole('heading', { name: 'Параметры коллекции', exact: true }),
        ],
        [
          'Резервная копия',
          page.getByRole('dialog').getByRole('button', { name: /^Сохранить резервную копию/ }),
        ],
        [
          'Исходный список VK',
          page.getByRole('dialog').getByRole('button', { name: /^Исходный список VK/ }),
        ],
      ]
      const marks = []
      for (const [label, locator] of targets) {
        const rect = await locator.boundingBox()
        if (!rect || rect.y < 0 || rect.y + rect.height > viewport.height)
          throw new Error('Guide target outside frame: ' + label)
        marks.push({
          label,
          x: (rect.x / viewport.width) * 100,
          y: (rect.y / viewport.height) * 100,
          width: (rect.width / viewport.width) * 100,
          height: (rect.height / viewport.height) * 100,
        })
      }
      await page.screenshot({ path: path.join(assets, `archive-${theme}.png`) })
      records.push({ key: 'archive', theme, ...viewport, marks })
      await page.getByRole('button', { name: 'Закрыть параметры коллекции', exact: true }).click()
    }
    await fs.writeFile(path.join(assets, 'captures.json'), JSON.stringify(records, null, 2) + '\n')
    const provenancePath = path.join(assets, 'PROVENANCE.md')
    const provenance = await fs.readFile(provenancePath, 'utf8')
    const note =
      'Archive frames updated by tools/guide/capture-collection-options.cjs from the production collection options dialog using an isolated synthetic two-record profile. No real account or collection was used.'
    if (!provenance.includes(note)) await fs.appendFile(provenancePath, '\n' + note + '\n')
    process.stdout.write('Updated collection options guide in both themes.\n')
  } finally {
    await app.close()
    if (
      path.dirname(profile) !== profileRoot ||
      !path.basename(profile).startsWith('collection-options-guide-')
    )
      throw new Error('Unsafe guide cleanup target')
    await fs.rm(profile, { recursive: true, force: true })
  }
})().catch((error) => {
  process.stderr.write(error.stack)
  process.exitCode = 1
})
