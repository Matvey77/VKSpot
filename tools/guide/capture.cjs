// Real UI screenshots for the welcome guide. Only an isolated synthetic profile.
const { execFile } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { promisify } = require('node:util')
const { launchElectronApp } = require('../lib/electron-harness.cjs')
const { createTempProfile, removeTempProfile } = require('../lib/profile.cjs')

const PROFILE_PREFIX = 'guide-profile-'
const execFileAsync = promisify(execFile)

async function convertPngToWebp(inputPng, outputWebp) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPng,
    '-c:v',
    'libwebp',
    '-quality',
    '86',
    '-compression_level',
    '6',
    outputWebp,
  ])
  await fs.rm(inputPng, { force: true })
}

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profile = await createTempProfile(root, PROFILE_PREFIX)
  const assets = path.join(root, 'src/renderer/src/assets/guide')
  await fs.mkdir(assets, { recursive: true })
  const records = []
  let app
  try {
    app = await launchElectronApp({ root, profile })
    const page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    // These responses are synthetic. Guide generation never contacts an account.
    await app.evaluate(async ({ session, shell }) => {
      await session.fromPartition('vkspot-spotify-api').protocol.handle('https', (request) => {
        const url = new URL(request.url)
        if (url.hostname === 'accounts.spotify.com')
          return Response.json({ access_token: 'demo', refresh_token: 'demo', expires_in: 3600 })
        if (url.pathname === '/v1/me') return Response.json({ id: 'Демонстрационный профиль' })
        if (url.pathname === '/v1/search') return Response.json({ tracks: { items: [] } })
        return new Response('', { status: 404 })
      })
      shell.openExternal = async (address) => {
        const url = new URL(address)
        const response = await fetch(
          'http://127.0.0.1:43823/callback?' +
            new URLSearchParams({ code: 'demo', state: url.searchParams.get('state') }),
          { headers: { Connection: 'close' }, signal: AbortSignal.timeout(10000) },
        )
        await response.text()
      }
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 1040),
    )
    await page.waitForSelector('h1')
    await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 1040)
    await page.evaluate(() => {
      localStorage.setItem('vkspot_inspector_layout', 'parallel')
      localStorage.setItem('vkspot_inspector_width', '640')
    })

    const initial = await page.evaluate(() =>
      window.vkspot.importCollection({
        name: 'Демо: шесть записей',
        origin: 'Синтетический пример для инструкции',
        completeness: { expected: 6, status: 'verified-count', message: 'Демонстрационные данные' },
        tracks: [
          {
            id: 'demo-1',
            artist: 'Демоисполнитель',
            title: 'song_RMX',
            duration: 185,
            availability: 'available',
            url: '',
            rawText: '',
          },
          {
            id: 'demo-1',
            artist: 'Демоисполнитель',
            title: 'song_RMX',
            duration: 185,
            availability: 'available',
            url: '',
            rawText: '',
          },
          {
            id: 'demo-2',
            artist: 'Демоавтор',
            title: 'Мэшап',
            duration: 200,
            availability: 'available',
            url: '',
            rawText: '',
          },
          {
            id: 'demo-3',
            artist: 'Демоисполнитель',
            title: 'Недоступная запись',
            duration: 210,
            availability: 'blocked',
            url: '',
            rawText: '',
          },
          { id: 'demo-4', artist: 'Демоисполнитель', title: 'Обычная песня', duration: 180 },
          { id: 'demo-5', artist: 'Демоисполнитель', title: 'Песня для поиска', duration: 190 },
        ],
      }),
    )
    if (!initial.ok) throw new Error(initial.error)
    const state = await page.evaluate(() => window.vkspot.state())
    if (!state.ok) throw new Error(state.error)
    const collection = state.value.collections[0],
      [first, repeat, local, blocked, plain] = collection.rows
    const candidate = {
      uri: 'spotify:track:' + 'a'.repeat(22),
      title: 'Название (Remix)',
      artists: ['Демоисполнитель'],
      duration: 185,
      album: 'Демонстрационный релиз',
      url: 'https://open.spotify.com/track/' + 'a'.repeat(22),
    }
    await page.evaluate(
      async ({ id, local, blocked }) => {
        await window.vkspot.patchRows(id, [local.id], {
          destination: 'local',
          local: {
            path: 'D:\\VKSpot Demo\\mashup.mp3',
            sha256: '0'.repeat(64),
            artist: 'Демоавтор',
            title: 'Мэшап',
            duration: 200,
            codec: 'MPEG 1 Layer 3',
            bitrate: 320000,
            size: 8000000,
          },
        })
        await window.vkspot.patchRows(id, [blocked.id], { excluded: true })
      },
      { id: collection.id, local, blocked },
    )

    const jobId = randomUUID()
    const job = {
      id: jobId,
      collectionId: collection.id,
      kind: 'transfer',
      state: 'complete',
      cursor: 2,
      total: 2,
      rowIds: [first.id, repeat.id],
      message:
        'Демонстрационный пример: каталожный этап завершён. Локальный файл добавляется через приложение Spotify.',
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
      plan: [
        {
          rowId: first.id,
          position: 1,
          artist: 'Демоисполнитель',
          title: 'Название (Remix)',
          version: 'Remix',
          destination: 'spotify',
          uri: candidate.uri,
          local: null,
        },
        {
          rowId: repeat.id,
          position: 2,
          artist: 'Демоисполнитель',
          title: 'Название (Remix)',
          version: 'Remix',
          destination: 'spotify',
          uri: candidate.uri,
          local: null,
        },
        {
          rowId: local.id,
          position: 3,
          artist: 'Демоавтор',
          title: 'Мэшап',
          version: '',
          destination: 'local',
          uri: null,
          local: {
            path: 'D:\\VKSpot Demo\\mashup.mp3',
            sha256: '0'.repeat(64),
            artist: 'Демоавтор',
            title: 'Мэшап',
            duration: 200,
            codec: 'MPEG 1 Layer 3',
            bitrate: 320000,
            size: 8000000,
          },
        },
      ],
    }
    const fixtureDb = new DatabaseSync(path.join(profile, 'collection.db'))
    fixtureDb.prepare('INSERT INTO jobs(id,payload) VALUES(?,?)').run(job.id, JSON.stringify(job))
    fixtureDb.close()

    const nav = async (name) => {
      await page.locator('nav').getByRole('button', { name, exact: true }).click()
      await page.evaluate(() => {
        for (const details of document.querySelectorAll('details')) details.open = false
        const view = document.querySelector('.content-page')
        if (view) view.scrollTop = 0
      })
    }

    const openDemoCollection = async () => {
      await page
        .locator('.collection-nav')
        .getByRole('button', { name: /Демо: шесть записей/ })
        .click()
      await page.getByRole('table').waitFor({ state: 'visible' })
    }

    const closeInspectorIfOpen = async () => {
      const closeBtn = page.getByRole('button', { name: 'Закрыть запись', exact: true })
      if (await closeBtn.isVisible()) await closeBtn.click()
    }

    const clearSelectionIfAny = async () => {
      const clearBtn = page.getByRole('button', { name: 'Снять выделение', exact: true })
      if (await clearBtn.isVisible()) await clearBtn.click()
    }

    const resetFiltersIfAny = async () => {
      const resetBtn = page.getByRole('button', { name: 'Сбросить фильтры', exact: true })
      if (await resetBtn.isVisible()) await resetBtn.click()
    }

    const capture = async (key, theme, targets) => {
      const marks = []
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      for (const [label, locator] of targets) {
        await locator.waitFor({ state: 'visible' })
        const rect = await locator.boundingBox()
        if (
          !rect ||
          rect.x < 0 ||
          rect.x + rect.width > viewport.width ||
          rect.y < 0 ||
          rect.y + rect.height > viewport.height
        )
          throw new Error('Capture target outside frame: ' + key + ' ' + label)
        const clipped = await locator.evaluate((element) => {
          const target = element.getBoundingClientRect()
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent),
              box = parent.getBoundingClientRect()
            if (
              /auto|scroll|hidden|clip/.test(style.overflowY) &&
              (target.top < box.top - 1 || target.bottom > box.bottom + 1)
            )
              return true
            if (
              /auto|scroll|hidden|clip/.test(style.overflowX) &&
              (target.left < box.left - 1 || target.right > box.right + 1)
            )
              return true
          }
          return false
        })
        if (clipped) throw new Error('Capture control clipped by ancestor: ' + key + ' ' + label)
        marks.push({
          label,
          x: (rect.x / viewport.width) * 100,
          y: (rect.y / viewport.height) * 100,
          width: (rect.width / viewport.width) * 100,
          height: (rect.height / viewport.height) * 100,
        })
      }
      const tmpPng = path.join(profile, `${key}-${theme}.png`)
      const outWebp = path.join(assets, `${key}-${theme}.webp`)
      await page.screenshot({ path: tmpPng })
      await convertPngToWebp(tmpPng, outWebp)
      records.push({ key, theme, width: viewport.width, height: viewport.height, marks })
      process.stdout.write(`Captured ${key} (${theme})\n`)
    }

    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        async ({ id, first, repeat, plain, candidate, theme }) => {
          await window.vkspot.disconnectSpotify()
          await window.vkspot.patchRows(id, [first.id, repeat.id], {
            artist: 'Демоисполнитель',
            title: 'Название (Remix)',
            version: 'Remix',
            note: '',
            spotify: candidate,
            destination: 'spotify',
            localPending: false,
            reviewDeferred: false,
            excluded: false,
            candidates: [
              {
                ...candidate,
                title: 'Название (Studio version)',
                uri: 'spotify:track:' + 'b'.repeat(22),
              },
              candidate,
            ],
          })
          await window.vkspot.patchRows(id, [plain.id], {
            destination: 'unresolved',
            localPending: false,
            reviewDeferred: false,
            excluded: false,
            spotify: null,
            searchedQuery: 'Демоисполнитель Обычная песня',
            candidates: [
              {
                uri: 'spotify:track:' + 'c'.repeat(22),
                title: 'Обычная песня',
                artists: ['Демоисполнитель'],
                duration: 181,
                album: 'Демонстрационный релиз',
                url: '',
              },
            ],
          })
          const currentState = await window.vkspot.state()
          if (!currentState.ok) throw new Error(currentState.error)
          const saved = await window.vkspot.saveSettings({
            ...currentState.value.settings,
            theme,
            clientId: '',
            spotifyProxy: '',
          })
          if (!saved.ok) throw new Error(saved.error)
        },
        { id: collection.id, first, repeat, plain, candidate, theme },
      )
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme)

      // 1. source
      await nav('Подключения')
      await capture('source', theme, [
        [
          'Подключения',
          page.locator('nav').getByRole('button', { name: 'Подключения', exact: true }),
        ],
        ['Открыть VK', page.getByRole('button', { name: 'Открыть VK', exact: true })],
        [
          'Выгрузить мой список',
          page.getByRole('button', { name: 'Выгрузить мой список', exact: true }),
        ],
      ])

      // 2. archive (Коллекции -> Параметры коллекции)
      await nav('Коллекции')
      await page
        .getByRole('button', { name: 'Параметры коллекции «Демо: шесть записей»', exact: true })
        .click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ state: 'visible' })
      await capture('archive', theme, [
        [
          'Параметры коллекции',
          dialog.getByRole('heading', { name: 'Параметры коллекции', exact: true }),
        ],
        [
          'Сохранить резервную копию',
          dialog.getByRole('button', { name: /^Сохранить резервную копию/ }),
        ],
        ['Исходный список VK', dialog.getByRole('button', { name: /^Исходный список VK/ })],
      ])
      await page.getByRole('button', { name: 'Закрыть параметры коллекции', exact: true }).click()

      // 3. edit-original
      await openDemoCollection()
      await clearSelectionIfAny()
      await resetFiltersIfAny()
      await page.getByRole('row', { name: 'Запись 1: Название (Remix)', exact: true }).click()
      await page.locator('.inspector-scroll-area').evaluate((el) => {
        el.scrollTop = 0
      })
      await capture('edit-original', theme, [
        ['Коллекции', page.locator('nav').getByRole('button', { name: 'Коллекции', exact: true })],
        ['Оригинал из VK', page.locator('.inspector-section').first()],
      ])

      // 4. edit
      await page.getByLabel('Заметка', { exact: true }).fill('Проверить авторский тег · ' + theme)
      await page
        .getByRole('button', { name: 'Сохранить правки', exact: true })
        .scrollIntoViewIfNeeded()
      await capture('edit', theme, [
        [
          'Рабочая копия',
          page.locator('.inspector').getByRole('heading', { name: 'Рабочая копия', exact: true }),
        ],
        ['Сохранить правки', page.getByRole('button', { name: 'Сохранить правки', exact: true })],
        [
          'Исключить',
          page.locator('.selection-bar').getByRole('button', { name: 'Исключить', exact: true }),
        ],
      ])
      await page.getByRole('button', { name: 'Сохранить правки', exact: true }).click()
      await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const save = buttons.find((button) => button.textContent?.includes('Сохранить правки'))
        return !!save && save.disabled
      })

      // 5. spotify-connect
      await nav('Подключения')
      await page.evaluate(async () => {
        const currentState = await window.vkspot.state()
        if (!currentState.ok) throw new Error(currentState.error)
        const saved = await window.vkspot.saveSettings({
          ...currentState.value.settings,
          clientId: '0123456789abcdef0123456789abcdef',
        })
        if (!saved.ok) throw new Error(saved.error)
      })
      await page.waitForFunction(() => {
        const input = document.querySelector('input[placeholder*="Spotify Developer"]')
        return input instanceof HTMLInputElement && input.value.length === 32
      })
      await page
        .getByRole('button', { name: 'Войти в Spotify', exact: true })
        .scrollIntoViewIfNeeded()
      await capture('spotify-connect', theme, [
        ['Client ID', page.getByLabel('Client ID', { exact: true })],
        ['Redirect URI', page.locator('.redirect-info code')],
        ['Войти в Spotify', page.getByRole('button', { name: 'Войти в Spotify', exact: true })],
      ])

      // Connect demo Spotify for search/transfer steps
      await page.evaluate(async () => {
        const result = await window.vkspot.connectSpotify()
        if (!result.ok) throw new Error(result.error)
      })

      // 6. spotify-search
      await openDemoCollection()
      await closeInspectorIfOpen()
      await clearSelectionIfAny()
      await resetFiltersIfAny()
      await capture('spotify-search', theme, [
        ['Фоновый поиск', page.getByRole('button', { name: /Фоновый поиск \(/ })],
        ['Результат поиска', page.locator('select[aria-label="Результат поиска"]')],
        [
          'Выделить совпадения',
          page.getByRole('button', { name: 'Выделить совпадения (1)', exact: true }),
        ],
      ])

      // 7. spotify-bulk
      await page.getByRole('button', { name: 'Выделить совпадения (1)', exact: true }).click()
      await capture('spotify-bulk', theme, [
        ['Результат поиска', page.locator('select[aria-label="Результат поиска"]')],
        [
          'Подтвердить выбранные',
          page.getByRole('button', { name: 'Подтвердить выбранные (1)', exact: true }),
        ],
        [
          'Отменить последнюю правку',
          page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }),
        ],
      ])

      // 8. spotify-match
      await clearSelectionIfAny()
      await resetFiltersIfAny()
      await page.evaluate(
        async ({ id, first }) => {
          await window.vkspot.patchRows(id, [first.id], {
            destination: 'unresolved',
            spotify: null,
          })
        },
        { id: collection.id, first },
      )
      await page.getByRole('row', { name: 'Запись 1: Название (Remix)', exact: true }).click()
      await page.locator('.inspector-scroll-area').evaluate((el) => {
        el.scrollTop = 0
      })
      await capture('spotify-match', theme, [
        ['Оригинал из VK', page.locator('.inspector-section').first()],
        [
          'Выбрать',
          page.locator('.candidate').nth(1).getByRole('button', { name: 'Выбрать', exact: true }),
        ],
        [
          'Нужен локальный файл',
          page
            .locator('.selection-bar')
            .getByRole('button', { name: 'Нужен локальный файл', exact: true }),
        ],
      ])

      // 9. local-link
      await clearSelectionIfAny()
      await resetFiltersIfAny()
      await page.getByRole('row', { name: 'Запись 3: Мэшап', exact: true }).click()
      await page.locator('.inspector-scroll-area').evaluate((el) => {
        el.scrollTop = 0
      })
      await capture('local-link', theme, [
        ['Привязать файл', page.getByRole('button', { name: 'Привязать файл', exact: true })],
        ['Версия для переноса', page.locator('.destination-state')],
      ])

      // 10. local-prepare
      await nav('Подключения')
      await page
        .getByRole('button', { name: 'Подготовить файлы', exact: true })
        .scrollIntoViewIfNeeded()
      await capture('local-prepare', theme, [
        ['Подготовить файлы', page.getByRole('button', { name: 'Подготовить файлы', exact: true })],
        ['Открыть Spotify', page.getByRole('button', { name: 'Открыть Spotify', exact: true })],
      ])

      // 11. transfer-plan
      await openDemoCollection()
      await closeInspectorIfOpen()
      await clearSelectionIfAny()
      await resetFiltersIfAny()
      await capture('transfer-plan', theme, [
        ['Проверить перенос', page.getByRole('button', { name: 'Проверить перенос', exact: true })],
      ])

      // 12. transfer
      await nav('Задания')
      await capture('transfer', theme, [
        ['Задания', page.locator('nav').getByRole('button', { name: 'Задания', exact: true })],
        [
          'Сверить смешанный порядок',
          page.getByRole('button', { name: 'Сверить смешанный порядок', exact: true }),
        ],
      ])
    }

    await fs.writeFile(path.join(assets, 'captures.json'), JSON.stringify(records, null, 2) + '\n')
    await fs.writeFile(
      path.join(assets, 'PROVENANCE.md'),
      'Screenshots captured from actual VKSpot Electron UI (1440x1040 content viewport) by tools/guide/capture.cjs and encoded to WebP via ffmpeg (libwebp). Separate synthetic six-record profile and mocked Spotify responses. No real account, audio file or user collection was used. All controls are rendered by production components.\n',
    )
    process.stdout.write(
      'Captured ' + records.length + ' real UI frames with measured control bounds.\n',
    )
  } finally {
    try {
      if (app) await app.close()
    } finally {
      await removeTempProfile(root, profile, PROFILE_PREFIX)
    }
  }
})().catch((error) => {
  process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n')
  process.exitCode = 1
})
