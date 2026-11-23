import type { ElectronApplication, Page } from '@playwright/test'
import type {
  AppState,
  Collection,
  Completeness,
  RawTrack,
  Settings,
  SpotifyTrack,
} from '../../src/shared/types'

export type SyntheticTrackInput = Partial<RawTrack> & Pick<RawTrack, 'artist' | 'title'>

export type SpotifyPlaylistStub = {
  id: string
  name: string
  uri?: string
  external_urls?: { spotify: string }
}

export type SpotifyApiMockOptions = {
  userId?: string
  displayName?: string
  denyGlobal?: string
  holdSearch?: boolean
  playlists?: SpotifyPlaylistStub[]
}

export type SpotifyBrowserMockOptions = {
  html?: string
  trackTitle?: string
  artistName?: string
  albumName?: string
}

export function makeSpotifyCandidate(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  const trackId = 'a'.repeat(22)
  return {
    uri: `spotify:track:${trackId}`,
    title: 'Plain Song',
    artists: ['Artist'],
    duration: 180,
    url: '',
    album: 'Synthetic',
    ...overrides,
  }
}

export async function getAppState(page: Page): Promise<AppState> {
  const state = await page.evaluate(() => window.vkspot.state())
  if (!state.ok) throw new Error(state.error)
  return state.value
}

export async function updateAppSettings(page: Page, patch: Partial<Settings>): Promise<void> {
  await page.evaluate(async (nextPatch) => {
    const state = await window.vkspot.state()
    if (!state.ok) throw new Error(state.error)
    const saved = await window.vkspot.saveSettings({ ...state.value.settings, ...nextPatch })
    if (!saved.ok) throw new Error(saved.error)
  }, patch)
}

export async function importSyntheticCollection(
  page: Page,
  input: {
    name: string
    origin?: string
    completeness?: Partial<Completeness>
    tracks: SyntheticTrackInput[]
  },
): Promise<Collection> {
  const normalizedTracks: RawTrack[] = input.tracks.map((track) => ({
    id: track.id ?? '',
    artist: track.artist,
    title: track.title,
    duration: track.duration ?? null,
    availability: track.availability ?? 'unknown',
    url: track.url ?? '',
    rawText: track.rawText ?? '',
  }))
  const completeness: Completeness = {
    expected: input.completeness?.expected ?? normalizedTracks.length,
    status: input.completeness?.status ?? 'verified-count',
    message: input.completeness?.message ?? 'Test only',
    ...(input.completeness?.reason ? { reason: input.completeness.reason } : {}),
  }
  return page.evaluate(
    async ({ name, origin, completeness, tracks }) => {
      const imported = await window.vkspot.importCollection({
        name,
        origin,
        completeness,
        tracks,
      })
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      const collection = state.value.collections.find((item) => item.id === imported.value)
      if (!collection) throw new Error(`Imported collection ${imported.value} not found`)
      return collection
    },
    {
      name: input.name,
      origin: input.origin ?? 'Synthetic test',
      completeness,
      tracks: normalizedTracks,
    },
  )
}

export async function installSpotifyApiMock(
  app: ElectronApplication,
  options: SpotifyApiMockOptions = {},
): Promise<void> {
  await app.evaluate(async ({ session, shell }, opts) => {
    const network = session.fromPartition('vkspot-spotify-api')
    try {
      await network.protocol.unhandle('https')
    } catch {
      /* Ignore when no handler was previously registered. */
    }
    await network.protocol.handle('https', async (request) => {
      const url = new URL(request.url)
      if (url.hostname === 'accounts.spotify.com') {
        return Response.json({
          access_token: 'synthetic',
          refresh_token: 'synthetic',
          expires_in: 3600,
        })
      }
      if (url.pathname === '/v1/me') {
        if (opts.denyGlobal && Reflect.get(globalThis, opts.denyGlobal)) {
          return Response.json(
            { error: { status: 403, message: 'Spotify is unavailable in this country' } },
            { status: 403 },
          )
        }
        return Response.json({
          id: opts.userId ?? 'synthetic-user',
          ...(opts.displayName ? { display_name: opts.displayName } : {}),
        })
      }
      if (url.pathname === '/v1/me/playlists' || url.pathname.endsWith('/playlists')) {
        if (request.method === 'POST') {
          return Response.json({
            id: 'synthetic-playlist',
            name: 'VKSpot',
            uri: 'spotify:playlist:synthetic',
            external_urls: { spotify: 'https://open.spotify.com/playlist/synthetic' },
          })
        }
        const items = opts.playlists ?? []
        return Response.json({ items, total: items.length, next: null })
      }
      if (url.pathname === '/v1/search') {
        if (opts.holdSearch) {
          await new Promise<void>((resolve) => Reflect.set(globalThis, '__releaseSearch', resolve))
        }
        return Response.json({ tracks: { items: [] } })
      }
      return new Response('', { status: 404 })
    })
    shell.openExternal = async (address) => {
      const url = new URL(address)
      await fetch(
        'http://127.0.0.1:43823/callback?' +
          new URLSearchParams({
            code: 'synthetic',
            state: url.searchParams.get('state')!,
          }),
      )
    }
  }, options)
}

export async function connectMockSpotifyApi(
  app: ElectronApplication,
  options: SpotifyApiMockOptions & { settingsPatch?: Partial<Settings> } = {},
): Promise<void> {
  const { settingsPatch, ...mockOptions } = options
  await installSpotifyApiMock(app, mockOptions)
  const page = await app.firstWindow()
  await page.evaluate(async (patch) => {
    const state = await window.vkspot.state()
    if (!state.ok) throw new Error(state.error)
    const saved = await window.vkspot.saveSettings({
      ...state.value.settings,
      clientId: 'a'.repeat(32),
      ...patch,
    })
    if (!saved.ok) throw new Error(saved.error)
    const connected = await window.vkspot.connectSpotify()
    if (!connected.ok) throw new Error(connected.error)
  }, settingsPatch ?? {})
}

export async function connectMockSpotifySearch(
  app: ElectronApplication,
  options: { autoResumeSearch?: boolean; holdSearch?: boolean; searchDelayMs?: number } = {},
): Promise<void> {
  await connectMockSpotifyApi(app, {
    holdSearch: options.holdSearch ?? true,
    settingsPatch: {
      searchProvider: 'api',
      searchDelayMs: options.searchDelayMs ?? 1000,
      autoResumeSearch: options.autoResumeSearch ?? false,
    },
  })
}

export async function releaseHeldSearch(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const release = Reflect.get(globalThis, '__releaseSearch') as (() => void) | undefined
    if (!release) throw new Error('Held Spotify API search was not waiting')
    release()
    Reflect.deleteProperty(globalThis, '__releaseSearch')
  })
}

export async function installSpotifyBrowserMock(
  app: ElectronApplication,
  options: SpotifyBrowserMockOptions = {},
): Promise<void> {
  await app.evaluate(async ({ session }, opts) => {
    Reflect.set(globalThis, '__browserQueries', [])
    Reflect.set(globalThis, '__browserCallTimes', [])
    Reflect.set(globalThis, '__holdBrowserSearch', false)
    Reflect.set(globalThis, '__browserLimited', false)
    Reflect.set(globalThis, '__browserChallenge', false)
    Reflect.set(globalThis, '__browserUpdated', false)
    Reflect.set(globalThis, '__browserEmpty', false)
    const network = session.fromPartition('persist:vkspot-spotify-browser')
    try {
      await network.protocol.unhandle('https')
    } catch {
      /* Ignore when no handler was previously registered. */
    }
    if (!opts.html) {
      // protocol.handle bypasses Chromium's network header events. Deliver the
      // equivalent event explicitly for synthetic 429 responses.
      Object.defineProperty(network.webRequest, 'onHeadersReceived', {
        configurable: true,
        value: (_filter: unknown, listener: unknown) =>
          Reflect.set(globalThis, '__browserHeaders', listener),
      })
    }
    await network.protocol.handle('https', async (request) => {
      const url = new URL(request.url)
      if (url.hostname !== 'open.spotify.com') return new Response('', { status: 404 })
      if (opts.html) {
        return new Response(opts.html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      const isSearch = url.pathname.startsWith('/search/')
      const query = decodeURIComponent(url.pathname.split('/')[2] ?? '')
      if (isSearch) {
        const calls = Reflect.get(globalThis, '__browserQueries') as string[]
        calls.push(query)
        if (Reflect.get(globalThis, '__holdBrowserSearch')) {
          await new Promise<void>((resolve) =>
            Reflect.set(globalThis, '__releaseBrowserSearch', resolve),
          )
        }
        const times = (Reflect.get(globalThis, '__browserCallTimes') ?? []) as number[]
        times.push(Date.now())
        Reflect.set(globalThis, '__browserCallTimes', times)
        if (Reflect.get(globalThis, '__browserLimited') && calls.length === 1) {
          Reflect.get(globalThis, '__browserHeaders')?.(
            {
              resourceType: 'mainFrame',
              statusCode: 429,
              responseHeaders: { 'Retry-After': ['2'] },
            },
            () => {},
          )
          return new Response('<body>Too many requests</body>', {
            status: 429,
            headers: { 'Retry-After': '2', 'content-type': 'text/html; charset=utf-8' },
          })
        }
      }
      if (Reflect.get(globalThis, '__browserChallenge')) {
        return new Response('<body><main>Verify you are human</main></body>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      const trackTitle = Reflect.get(globalThis, '__browserUpdated')
        ? 'Updated Song'
        : (opts.trackTitle ?? 'Song')
      const artistName = opts.artistName ?? 'Artist'
      const albumName = opts.albumName ?? 'Album'
      const rows =
        query.includes('Missing') || Reflect.get(globalThis, '__browserEmpty')
          ? '<h1>Ничего не найдено</h1>'
          : `
        <div data-testid="tracklist-row"><div role="gridcell"><a href="/track/${'a'.repeat(22)}">${trackTitle}</a><a href="/artist/${'b'.repeat(22)}">${artistName}</a></div><div role="gridcell"><a href="/album/${'c'.repeat(22)}">${albumName}</a><span>3:00</span></div></div>`
      return new Response(
        '<!doctype html><html><body><iframe src="about:blank#captcha" style="display:none"></iframe><main>' +
          rows +
          '</main></body></html>',
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      )
    })
  }, options)
}
