// Real UI screenshots for the welcome guide. Only an isolated synthetic profile.
const { _electron } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profileRoot = path.join(root, '.local/tmp')
  await fs.mkdir(profileRoot, { recursive: true })
  const profile = await fs.mkdtemp(path.join(profileRoot, 'guide-profile-'))
  const assets = path.join(root, 'src/renderer/src/assets/guide')
  await fs.mkdir(assets, { recursive: true })
  const env = { ...process.env, VKSPOT_DATA_DIR: profile, VKSPOT_BACKGROUND_TEST: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ args: [root], env })
  const records = []
  try {
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
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 1040))
    await page.waitForSelector('h1')
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
      async ({ id, first, repeat, local, blocked, candidate }) => {
        await window.vkspot.patchRows(id, [first.id, repeat.id], {
          artist: 'Демоисполнитель',
          title: 'Название (Remix)',
          version: 'Remix',
          spotify: candidate,
          destination: 'spotify',
          candidates: [
            {
              ...candidate,
              title: 'Название (Studio version)',
              uri: 'spotify:track:' + 'b'.repeat(22),
            },
            candidate,
          ],
        })
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
      { id: collection.id, first, repeat, local, blocked, candidate },
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
    const { DatabaseSync } = require('node:sqlite')
    const fixtureDb = new DatabaseSync(path.join(profile, 'collection.db'))
    fixtureDb.prepare('INSERT INTO jobs(id,payload) VALUES(?,?)').run(job.id, JSON.stringify(job))
    fixtureDb.close()
    const nav = async (name) => {
      await page.getByRole('button', { name, exact: true }).click()
      const view = page.locator('.content-page')
      if (await view.count())
        await view.evaluate((el) => {
          el.scrollTop = 0
        })
    }
    const capture = async (key, theme, targets) => {
      const marks = []
      const viewport =
        page.viewportSize() ??
        (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      for (const [label, locator] of targets) {
        const rect = await locator.boundingBox()
        if (!rect || rect.y < 0 || rect.y + rect.height > viewport.height)
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
      await page.screenshot({ path: path.join(assets, `${key}-${theme}.png`) })
      records.push({ key, theme, width: viewport.width, height: viewport.height, marks })
      process.stdout.write(`Captured ${key} (${theme})\n`)
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        async ({ id, first, plain }) => {
          await window.vkspot.patchRows(id, [first.id], { destination: 'spotify' })
          await window.vkspot.patchRows(id, [plain.id], {
            destination: 'unresolved',
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
        },
        { id: collection.id, first, plain },
      )
      await page.evaluate(async (theme) => {
        const state = await window.vkspot.state()
        if (state.ok) await window.vkspot.saveSettings({ ...state.value.settings, theme })
      }, theme)
      await page.locator('html').waitFor()
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme)
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
      await nav('Архив и экспорт')
      await capture('archive', theme, [
        [
          'Архив и экспорт',
          page.locator('nav').getByRole('button', { name: 'Архив и экспорт', exact: true }),
        ],
        [
          'Полный архив',
          page
            .locator('.export-option')
            .nth(0)
            .getByRole('button', { name: 'Сохранить', exact: true }),
        ],
        [
          'Исходный список',
          page
            .locator('.export-option')
            .nth(1)
            .getByRole('button', { name: 'Сохранить', exact: true }),
        ],
      ])
      await nav('Коллекция')
      await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
      await page.getByRole('row', { name: 'Запись 1: Название (Remix)', exact: true }).click()
      await page.locator('.inspector').evaluate((el) => {
        el.scrollTop = 0
      })
      await capture('edit-original', theme, [
        ['Коллекция', page.locator('nav').getByRole('button', { name: 'Коллекция', exact: true })],
        ['Оригинал из VK', page.locator('.inspector-section').first()],
      ])
      await page.getByLabel('Заметка', { exact: true }).fill('Проверить авторский тег · ' + theme)
      await page.locator('.inspector').evaluate((el) => {
        el.scrollTop = 190
      })
      await capture('edit', theme, [
        ['Коллекция', page.locator('nav').getByRole('button', { name: 'Коллекция', exact: true })],
        [
          'Рабочая копия',
          page
            .locator('.inspector-section')
            .nth(1)
            .getByRole('heading', { name: 'Рабочая копия', exact: true }),
        ],
        ['Сохранить правки', page.getByRole('button', { name: 'Сохранить правки', exact: true })],
        ['Исключить', page.getByLabel('Исключить из переноса')],
      ])
      await page.getByRole('button', { name: 'Сохранить правки', exact: true }).click()
      await nav('Подключения')
      await page
        .getByText('Spotify API — подключение для переноса', { exact: true })
        .evaluate((element) => {
          element.parentElement.open = true
        })
      await page.getByLabel('Client ID', { exact: true }).scrollIntoViewIfNeeded()
      await capture('spotify-connect', theme, [
        ['Client ID', page.getByLabel('Client ID', { exact: true })],
        ['Redirect URI', page.locator('.redirect-info code')],
        ['Войти в Spotify', page.getByRole('button', { name: 'Войти в Spotify', exact: true })],
      ])
      await page.evaluate(async () => {
        const state = await window.vkspot.state()
        if (!state.ok) throw new Error(state.error)
        await window.vkspot.saveSettings({ ...state.value.settings, clientId: 'a'.repeat(32) })
        const result = await window.vkspot.connectSpotify()
        if (!result.ok) throw new Error(result.error)
      })
      await nav('Коллекция')
      await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
      await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
      await capture('spotify-search', theme, [
        ['Фоновый поиск', page.getByRole('button', { name: /Фоновый поиск \(/ })],
        ['Результат поиска', page.getByLabel('Результат поиска', { exact: true })],
        [
          'Выделить совпадения',
          page.getByRole('button', { name: 'Выделить совпадения (1)', exact: true }),
        ],
      ])
      await page.getByRole('button', { name: 'Выделить совпадения (1)', exact: true }).click()
      await capture('spotify-bulk', theme, [
        ['Результат поиска', page.getByLabel('Результат поиска', { exact: true })],
        [
          'Подтвердить выбранные',
          page.getByRole('button', { name: 'Подтвердить выбранные (1)', exact: true }),
        ],
        [
          'Отменить последнюю правку',
          page.getByRole('button', { name: 'Отменить последнюю правку', exact: true }),
        ],
      ])
      await page.evaluate(
        async ({ id, first }) => {
          await window.vkspot.patchRows(id, [first.id], { destination: 'unresolved' })
        },
        { id: collection.id, first },
      )
      await page.getByRole('tab', { name: 'Разбор коллекции', exact: true }).click()
      await page.getByRole('tab', { name: /Проверить версии 1/ }).click()
      await capture('spotify-match', theme, [
        ['Оригинал VK', page.locator('.review-source')],
        [
          'Выбрать и дальше',
          page
            .locator('.review-candidate')
            .nth(1)
            .getByRole('button', { name: 'Выбрать и дальше', exact: true }),
        ],
        [
          'Нужен локальный файл',
          page.getByRole('button', { name: 'Нужен локальный файл', exact: true }),
        ],
      ])
      await page.getByRole('tab', { name: 'Таблица', exact: true }).click()
      await page.getByRole('button', { name: 'Снять выделение', exact: true }).click()
      await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
      await page.getByRole('row', { name: 'Запись 3: Мэшап', exact: true }).click()
      await page
        .getByRole('button', { name: 'Привязать файл', exact: true })
        .scrollIntoViewIfNeeded()
      await capture('local-link', theme, [
        ['Привязать файл', page.getByRole('button', { name: 'Привязать файл', exact: true })],
        ['Назначение', page.locator('.destination-state')],
      ])
      await nav('Подключения')
      await page
        .getByRole('button', { name: 'Подготовить файлы', exact: true })
        .scrollIntoViewIfNeeded()
      await capture('local-prepare', theme, [
        ['Подготовить файлы', page.getByRole('button', { name: 'Подготовить файлы', exact: true })],
        ['Открыть Spotify', page.getByRole('button', { name: 'Открыть Spotify', exact: true })],
      ])
      await nav('Коллекция')
      await page.getByRole('button', { name: 'Закрыть запись', exact: true }).click()
      await capture('transfer-plan', theme, [
        ['Проверить перенос', page.getByRole('button', { name: 'Проверить перенос', exact: true })],
      ])
      await nav('Задания')
      await capture('transfer', theme, [
        ['Задания', page.locator('nav').getByRole('button', { name: 'Задания', exact: true })],
        [
          'Сверить смешанный порядок',
          page.getByRole('button', { name: 'Сверить смешанный порядок', exact: true }),
        ],
      ])
      await page.evaluate(() => window.vkspot.disconnectSpotify())
    }
    await fs.writeFile(path.join(assets, 'captures.json'), JSON.stringify(records, null, 2) + '\n')
    await fs.writeFile(
      path.join(assets, 'PROVENANCE.md'),
      'Screenshots captured from actual VKSpot Electron UI by tools/guide/capture.cjs. Separate synthetic six-record profile and mocked Spotify responses. No real account, audio file or user collection was used. All controls are rendered by production components.\n',
    )
    process.stdout.write(
      'Captured ' + records.length + ' real UI frames with measured control bounds.\n',
    )
  } finally {
    await app.close()
    if (
      path.dirname(profile) !== profileRoot ||
      !path.basename(profile).startsWith('guide-profile-')
    )
      throw new Error('Unsafe guide profile cleanup target')
    await fs.rm(profile, { recursive: true, force: true })
  }
})().catch((error) => {
  process.stderr.write(error.stack)
  process.exitCode = 1
})
