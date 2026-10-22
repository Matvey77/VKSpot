import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { vkAudioPage, modernVKAudioPage, silentWav } from '../fixtures/vk-audio-page'
import { openLibrary } from './navigation'

let directory: string
let app: ElectronApplication
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vkspot-audio-'))
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
  app = await electron.launch({
    executablePath: process.env.VKSPOT_TEST_EXECUTABLE,
    args: process.env.VKSPOT_TEST_EXECUTABLE ? [] : ['.'],
    env,
  })
  await app.firstWindow()
})
test.afterEach(async () => {
  await app?.close()
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-audio-')
  )
    throw new Error('Unsafe audio test cleanup')
  await rm(directory, { recursive: true, force: true })
})

async function fixture(
  options: Parameters<typeof vkAudioPage>[0] = {},
  html = vkAudioPage(options),
) {
  await app.evaluate(
    async ({ session }, { html, wav }) => {
      Reflect.set(globalThis, '__vkAudioRequests', [])
      await session.fromPartition('persist:vkspot-vk').protocol.handle('https', (request) => {
        const url = new URL(request.url)
        Reflect.get(globalThis, '__vkAudioRequests').push(request.url)
        if (url.pathname === '/vkspot-fixture.wav')
          return new Response(new Uint8Array(wav), { headers: { 'content-type': 'audio/wav' } })
        return new Response(
          url.pathname === '/audio'
            ? '<a data-testid="AudioCatalog_Tabs_Tab_all" href="https://vk.ru/audios42?section=all">Моя музыка</a><aside>Recommendations</aside>'
            : html,
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      })
    },
    { html, wav: Array.from(silentWav()) },
  )
}

async function playback() {
  return app.evaluate(async ({ webContents }) => {
    const view = webContents
      .getAllWebContents()
      .find((item) => item.getURL().startsWith('https://vk.ru/audios42'))
    return view
      ? view.executeJavaScript(
          '({clicked:window.__clicked,wrong:window.__wrong,paused:document.querySelector("audio").paused,time:document.querySelector("audio").currentTime})',
        )
      : null
  })
}

test('original without ID at position 113 plays from the personal virtual library and pauses without restarting', async () => {
  await fixture()
  const page = await app.firstWindow()
  await page.evaluate(() =>
    window.vkspot.importCollection({
      name: 'VK playback fixture',
      origin: 'Synthetic',
      completeness: { expected: 113, status: 'verified-count', message: 'Test only' },
      tracks: Array.from({ length: 113 }, (_, index) => ({
        artist: index === 112 ? 'Synthetic Artist' : 'Fixture Artist',
        title: index === 112 ? 'Original (Live)' : `Song ${index}`,
        duration: 223,
      })),
    } as never),
  )
  await openLibrary(page)
  await page.getByLabel('Найти запись', { exact: true }).fill('Synthetic Artist Original')
  await page.getByRole('row', { name: 'Запись 113: Original (Live)', exact: true }).click()
  const inspector = page.locator('.inspector')
  await inspector.getByRole('button', { name: 'Слушать оригинал VK', exact: true }).click()
  await expect(inspector.getByRole('button', { name: 'Пауза VK', exact: true })).toBeVisible({
    timeout: 20000,
  })
  expect(await playback()).toMatchObject({ clicked: [112], wrong: false, paused: false })
  expect((await playback()).time).toBeGreaterThan(0.15)
  expect(
    await app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('https://vk.ru/audios42'))!
      return view.executeJavaScript('({width:innerWidth,height:innerHeight})')
    }),
  ).toEqual({ width: 1280, height: 800 })
  await inspector.getByRole('button', { name: 'Пауза VK', exact: true }).click()
  await expect(
    inspector.getByRole('button', { name: 'Слушать оригинал VK', exact: true }),
  ).toBeVisible()
  expect(await playback()).toMatchObject({ clicked: [112], paused: true })
  const requests = await app.evaluate(
    () => Reflect.get(globalThis, '__vkAudioRequests') as string[],
  )
  expect(requests).toContain('https://vk.ru/audios42?section=all')
  expect(requests.every((url) => !new URL(url).searchParams.has('q'))).toBe(true)
})

test('exact ID wins over changed descriptions and a stale source position', async () => {
  await fixture({ ids: true })
  const page = await app.firstWindow()
  const result = await page.evaluate(() =>
    window.vkspot.playVKTrack({
      id: '42_113',
      artist: 'Old description',
      title: 'Old title',
      duration: 223,
      position: 5,
    }),
  )
  expect(result).toMatchObject({ ok: true, value: { playing: true } })
  expect(await playback()).toMatchObject({ clicked: [112], wrong: false })
})

test('missing ID and position still scan virtual rows and never select a majority-word or recommendation match', async () => {
  await fixture({ noAria: true })
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
      }),
    ),
  ).toMatchObject({ ok: true, value: { playing: true } })
  expect(await playback()).toMatchObject({ clicked: [112], wrong: false })
})

test('a missing version is not replaced by another artist or by recommendations', async () => {
  await fixture({ total: 25, missing: true })
  const page = await app.firstWindow()
  const result = await page.evaluate(() =>
    window.vkspot.playVKTrack({
      artist: 'Synthetic Artist',
      title: 'Original (Live)',
      duration: 223,
    }),
  )
  expect(result).toMatchObject({
    ok: true,
    value: { playing: false, error: expect.stringContaining('не найдена в личной медиатеке') },
  })
  expect(await playback()).toMatchObject({ clicked: [], wrong: false })
})

test('a blocked original is reported without trying a different recording', async () => {
  await fixture({ blocked: true })
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 113,
      }),
    ),
  ).toMatchObject({
    ok: true,
    value: { playing: false, error: expect.stringContaining('недоступную') },
  })
  expect(await playback()).toMatchObject({ clicked: [], wrong: false })
})

test('a pause icon stuck at zero is not accepted as successful playback', async () => {
  await fixture({ stalled: true })
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 113,
      }),
    ),
  ).toMatchObject({
    ok: true,
    value: { playing: false, error: expect.stringContaining('не начал воспроизведение') },
  })
  expect(await playback()).toMatchObject({ clicked: [112], wrong: false, paused: true, time: 0 })
})

test('WebAudio playback is confirmed by an advancing counter on the identified row', async () => {
  await fixture({ webAudio: true })
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 113,
      }),
    ),
  ).toMatchObject({ ok: true, value: { playing: true } })
  expect(await playback()).toMatchObject({ clicked: [112], wrong: false, paused: true, time: 0 })
  expect(await page.evaluate(() => window.vkspot.pauseVKTrack())).toMatchObject({
    ok: true,
    value: { playing: false },
  })
})

test('cancelling a pending lookup prevents late playback and a new request can play another original', async () => {
  await fixture({ total: 1000, target: 900 })
  const page = await app.firstWindow()
  await page.evaluate(() => {
    Reflect.set(
      window,
      '__pendingVKAudio',
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
      }),
    )
  })
  await expect.poll(() => playback()).not.toBeNull()
  expect(await page.evaluate(() => window.vkspot.pauseVKTrack())).toMatchObject({
    ok: true,
    value: { playing: false },
  })
  expect(await page.evaluate(() => Reflect.get(window, '__pendingVKAudio'))).toMatchObject({
    ok: true,
    value: { playing: false },
  })
  expect(await playback()).toBeNull()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Another Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 1,
      }),
    ),
  ).toMatchObject({ ok: true, value: { playing: true } })
  expect(await playback()).toMatchObject({ clicked: [0], wrong: false })
})

test('current VK tap target and full WebAudio player work again after pausing with elapsed row duration', async () => {
  await fixture({}, modernVKAudioPage())
  const page = await app.firstWindow()
  const play = () =>
    page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 2,
      }),
    )
  expect(await play()).toMatchObject({ ok: true, value: { playing: true } })
  await page.evaluate(() => window.vkspot.pauseVKTrack())
  const state = () =>
    app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith('https://vk.ru/audios42'))!
      return view.executeJavaScript(
        '({taps:window.__tapClicks,covers:window.__coverClicks,button:[...document.querySelectorAll("[data-testid=TopAudioPlayer_TogglePlayAction]")].find(n=>n.getClientRects().length).textContent,time:[...document.querySelectorAll("[data-testid=AudioPlayerBlock_ProgressTimer]")].find(n=>n.getClientRects().length).textContent})',
      )
    })
  const paused = await state()
  expect(paused).toMatchObject({ taps: 1, covers: 0, button: 'Воспроизвести' })
  expect(await play()).toMatchObject({ ok: true, value: { playing: true } })
  await page.evaluate(() => window.vkspot.pauseVKTrack())
  expect(await state()).toMatchObject({ taps: 2, covers: 0, button: 'Воспроизвести' })
})

test('pre-roll advertising is reported, allowed to finish and never counted as the requested original', async () => {
  await fixture({}, modernVKAudioPage({ adMs: 2000 }))
  const page = await app.firstWindow()
  await page.evaluate(() => {
    Reflect.set(window, '__audioMessages', [])
    Reflect.set(window, '__audioDone', false)
    window.vkspot.onVKAudioProgress((message) =>
      Reflect.get(window, '__audioMessages').push(message),
    )
    Reflect.set(
      window,
      '__audioPending',
      window.vkspot
        .playVKTrack({
          artist: 'Synthetic Artist',
          title: 'Original (Live)',
          duration: 223,
          position: 2,
        })
        .then((result) => {
          Reflect.set(window, '__audioDone', true)
          return result
        }),
    )
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, '__audioMessages').some((message: string) =>
          message.includes('рекламу'),
        ),
      ),
    )
    .toBe(true)
  expect(await page.evaluate(() => Reflect.get(window, '__audioDone'))).toBe(false)
  expect(await page.evaluate(() => Reflect.get(window, '__audioPending'))).toMatchObject({
    ok: true,
    value: { playing: true },
  })
  await page.evaluate(() => window.vkspot.pauseVKTrack())
})

test('cancelling during a WebAudio advert destroys the playback document and prevents late sound', async () => {
  await fixture({}, modernVKAudioPage({ adMs: 20000 }))
  const page = await app.firstWindow()
  await page.evaluate(() => {
    Reflect.set(window, '__audioAdvert', false)
    window.vkspot.onVKAudioProgress((message) => {
      if (message.includes('рекламу')) Reflect.set(window, '__audioAdvert', true)
    })
    Reflect.set(
      window,
      '__audioPending',
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 2,
      }),
    )
  })
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__audioAdvert'))).toBe(true)
  await page.evaluate(() => window.vkspot.pauseVKTrack())
  expect(await page.evaluate(() => Reflect.get(window, '__audioPending'))).toMatchObject({
    ok: true,
    value: { playing: false },
  })
  expect(await playback()).toBeNull()
})

test('an advancing global player for a different title and artist cannot confirm the original', async () => {
  await fixture({}, modernVKAudioPage({ wrongPlayer: true }))
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 2,
      }),
    ),
  ).toMatchObject({
    ok: true,
    value: { playing: false, error: expect.stringContaining('не начал воспроизведение') },
  })
})

test('the identified full player confirms playback after virtual rows disappear', async () => {
  await fixture({}, modernVKAudioPage({ dropRow: true }))
  const page = await app.firstWindow()
  expect(
    await page.evaluate(() =>
      window.vkspot.playVKTrack({
        artist: 'Synthetic Artist',
        title: 'Original (Live)',
        duration: 223,
        position: 2,
      }),
    ),
  ).toMatchObject({ ok: true, value: { playing: true } })
  await page.evaluate(() => window.vkspot.pauseVKTrack())
})
