import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
  },
  shell: {},
}))
import { safeStorage } from 'electron'
import {
  Spotify,
  SpotifyError,
  createOAuthCallbackHandler,
  parseRetryAfterSeconds,
  secureTokenStorageAvailable,
} from '../../src/main/integrations/spotify/api'
import { settingsSchema } from '../../src/shared/model'

const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('vkspot-spotify-test-')
    )
      throw new Error('Unsafe test cleanup target')
    rmSync(directory, { recursive: true, force: true })
  }
})

function savedSession(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vkspot-spotify-test-'))
  directories.push(directory)
  const path = join(directory, 'spotify.enc')
  writeFileSync(
    path,
    JSON.stringify({
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      expiresAt: Date.now() + 3600000,
      clientId: 'a'.repeat(32),
    }),
  )
  return path
}

describe('Spotify connection evidence', () => {
  it('requires a real secret store on Linux before using encrypted tokens', () => {
    const backend = vi.spyOn(safeStorage, 'getSelectedStorageBackend')
    for (const value of ['basic_text', 'unknown'] as const) {
      backend.mockReturnValue(value)
      expect(secureTokenStorageAvailable('linux')).toBe(false)
    }
    for (const value of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'] as const) {
      backend.mockReturnValue(value)
      expect(secureTokenStorageAvailable('linux')).toBe(true)
    }
    backend.mockReturnValue('basic_text')
    expect(secureTokenStorageAvailable('win32')).toBe(true)
    expect(secureTokenStorageAvailable('darwin')).toBe(true)
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    expect(secureTokenStorageAvailable('linux')).toBe(false)
    expect(secureTokenStorageAvailable('win32')).toBe(false)
  })

  it.runIf(process.platform === 'linux')(
    'does not read a token using the basic Linux backend',
    () => {
      vi.spyOn(safeStorage, 'getSelectedStorageBackend').mockReturnValue('basic_text')
      const decrypt = vi.spyOn(safeStorage, 'decryptString')
      const spotify = new Spotify(savedSession())
      expect(spotify.hasSession()).toBe(false)
      expect(decrypt).not.toHaveBeenCalled()
    },
  )
  it.runIf(process.platform === 'linux')(
    'does not overwrite a token when the secret store becomes unavailable',
    async () => {
      const path = savedSession()
      const original = readFileSync(path)
      const spotify = new Spotify(path, async () =>
        Response.json({ access_token: 'new-synthetic', expires_in: 3600 }),
      )
      vi.spyOn(safeStorage, 'getSelectedStorageBackend').mockReturnValue('basic_text')
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000)
      await expect(spotify.search('Test')).rejects.toThrow('защищённое хранилище')
      expect(readFileSync(path)).toEqual(original)
    },
  )
  it.each([
    [{ error: { reason: 'QUOTA_EXCEEDED' } }, '19173', 'quota', 19173],
    [{ reason: 'QUOTA_EXCEEDED' }, '11704', 'quota', 11704],
    [{ error: { message: 'Too many requests' } }, '120', 'rate-limit', 120],
    [{}, 'invalid', 'rate-limit', 60],
  ] as const)(
    'retains the server wait and distinguishes quota exhaustion: %j',
    async (body, header, reason, seconds) => {
      const spotify = new Spotify(savedSession(), async () =>
        Response.json(body, { status: 429, headers: { 'Retry-After': header } }),
      )
      const error = await spotify.search('Synthetic').catch((error) => error)
      expect(error).toBeInstanceOf(SpotifyError)
      expect(error.retryAfter).toBe(seconds)
      expect(error.waitReason).toBe(reason)
    },
  )
  it('does not treat a stored token or rejected profile as a verified connection', async () => {
    let denied = true
    const spotify = new Spotify(savedSession(), async () =>
      denied
        ? Response.json(
            { error: { status: 403, message: 'Spotify is unavailable in this country' } },
            { status: 403 },
          )
        : Response.json({ display_name: 'Test listener', id: 'test-user' }),
    )
    expect(spotify.hasSession()).toBe(true)
    expect(spotify.connected()).toBe(false)
    await expect(spotify.profile()).rejects.toThrow('страны этого подключения')
    expect(spotify.connected()).toBe(false)
    denied = false
    await expect(spotify.profile()).resolves.toBe('Test listener')
    expect(spotify.connected()).toBe(true)
    spotify.invalidateAccess()
    expect(spotify.connected()).toBe(false)
    expect(spotify.hasSession()).toBe(true)
  })

  it('withdraws connection evidence when an API request rejects access', async () => {
    let status = 200
    const spotify = new Spotify(savedSession(), async () =>
      Response.json(
        status === 200
          ? { id: 'test-user' }
          : { error: { message: 'Spotify is unavailable in this country' } },
        { status },
      ),
    )
    await spotify.profile()
    expect(spotify.connected()).toBe(true)
    status = 403
    await expect(spotify.search('Test')).rejects.toThrow('страны этого подключения')
    expect(spotify.connected()).toBe(false)
    status = 200
    await spotify.profile()
    expect(spotify.connected()).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000)
    status = 401
    await expect(spotify.search('Test')).rejects.toThrow('Сессия Spotify истекла')
    expect(spotify.connected()).toBe(false)
  })

  it('accepts plain HTTP and SOCKS proxy addresses and rejects embedded credentials or paths', () => {
    const settings = {
      clientId: '',
      playlistName: 'Test',
      searchDelayMs: 5000,
      theme: 'light',
    }
    expect(settingsSchema.parse(settings).spotifyProxy).toBe('')
    expect(settingsSchema.parse(settings).vkProxy).toBe('')
    for (const field of ['spotifyProxy', 'vkProxy']) {
      for (const value of ['', 'http://127.0.0.1:2080', 'socks5://[::1]:2080'])
        expect(settingsSchema.safeParse({ ...settings, [field]: value }).success).toBe(true)
      for (const value of [
        'file:///tmp/proxy',
        'http://user:secret@localhost:2080',
        'http://localhost:2080/path',
        'http://localhost:2080?token=test',
      ])
        expect(settingsSchema.safeParse({ ...settings, [field]: value }).success).toBe(false)
    }
  })

  it('parses HTTP-date in Retry-After headers', async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const futureDate = new Date(now + 95_000).toUTCString()
    expect(parseRetryAfterSeconds(futureDate, now)).toBe(95)
    expect(parseRetryAfterSeconds(new Date(now - 5_000).toUTCString(), now)).toBe(1)

    const spotify = new Spotify(savedSession(), async () =>
      Response.json(
        { error: { message: 'Too many requests' } },
        { status: 429, headers: { 'Retry-After': futureDate } },
      ),
    )
    const error = await spotify.search('Synthetic').catch((err) => err)
    expect(error).toBeInstanceOf(SpotifyError)
    expect(error.retryAfter).toBe(95)
    expect(error.waitReason).toBe('rate-limit')
  })

  it('distinguishes GET and write network errors in request()', async () => {
    const spotify = new Spotify(savedSession(), async () => {
      throw new Error('ECONNRESET')
    })

    const getError = await spotify.request('/me', 'GET').catch((err: unknown) => err)
    expect(getError).toBeInstanceOf(SpotifyError)
    if (getError instanceof SpotifyError) {
      expect(getError.ambiguousWrite).toBe(false)
      expect(getError.message).not.toContain('Запись в Spotify могла выполниться')
    }

    const postError = await spotify
      .request('/me/playlists', 'POST', { name: 'Test' })
      .catch((e: unknown) => e)
    expect(postError).toBeInstanceOf(SpotifyError)
    if (postError instanceof SpotifyError) {
      expect(postError.ambiguousWrite).toBe(true)
      expect(postError.message).toContain('Запись в Spotify могла выполниться')
    }
  })

  it('supports AbortSignal in playlistItems()', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    const spotify = new Spotify(savedSession(), fetchMock)
    await expect(spotify.playlistItems('playlist123', controller.signal)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed, non-GET, or invalid-Host OAuth callback requests without crashing', async () => {
    const onComplete = vi.fn()
    const server = createServer(createOAuthCallbackHandler('expected-state', onComplete))
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Unexpected server address')

    const sendRaw = (method: string, path: string, hostHeader?: string) =>
      new Promise<{ statusCode: number | undefined; connection: string | string[] | undefined }>(
        (resolveReq, rejectReq) => {
          const req = httpRequest(
            {
              host: '127.0.0.1',
              port: address.port,
              method,
              path,
              headers: hostHeader ? { Host: hostHeader } : {},
            },
            (res) => {
              res.resume()
              res.on('end', () =>
                resolveReq({ statusCode: res.statusCode, connection: res.headers.connection }),
              )
            },
          )
          req.on('error', rejectReq)
          req.end()
        },
      )

    try {
      const badMethod = await sendRaw(
        'POST',
        '/callback?code=abc&state=expected-state',
        '127.0.0.1:43823',
      )
      expect(badMethod).toEqual({ statusCode: 400, connection: 'close' })

      const badHost = await sendRaw(
        'GET',
        '/callback?code=abc&state=expected-state',
        'evil.example:43823',
      )
      expect(badHost).toEqual({ statusCode: 400, connection: 'close' })

      const protocolRelative = await sendRaw('GET', '//evil.example/callback', '127.0.0.1:43823')
      expect(protocolRelative).toEqual({ statusCode: 400, connection: 'close' })

      const badState = await sendRaw(
        'GET',
        '/callback?code=abc&state=wrong-state',
        '127.0.0.1:43823',
      )
      expect(badState).toEqual({ statusCode: 400, connection: 'close' })

      const badStateDetails = await new Promise<{
        statusCode: number | undefined
        contentType: string | undefined
        body: string
      }>((resolveReq, rejectReq) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port: address.port,
            method: 'GET',
            path: '/callback?code=abc&state=wrong-state',
            headers: { Host: '127.0.0.1:43823' },
          },
          (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
              body += chunk
            })
            res.on('end', () =>
              resolveReq({
                statusCode: res.statusCode,
                contentType: res.headers['content-type'],
                body,
              }),
            )
          },
        )
        req.on('error', rejectReq)
        req.end()
      })
      expect(badStateDetails.statusCode).toBe(400)
      expect(badStateDetails.contentType).toContain('text/html; charset=utf-8')
      expect(badStateDetails.body).toContain('Не удалось подтвердить сессию входа Spotify')
      expect(badStateDetails.body).not.toContain('Invalid state')

      const wrongPath = await sendRaw('GET', '/favicon.ico', '127.0.0.1:43823')
      expect(wrongPath).toEqual({ statusCode: 404, connection: 'close' })

      expect(onComplete).not.toHaveBeenCalled()

      const valid = await sendRaw(
        'GET',
        '/callback?code=auth-code-1&state=expected-state',
        '127.0.0.1:43823',
      )
      expect(valid).toEqual({ statusCode: 200, connection: 'close' })
      expect(onComplete).toHaveBeenCalledExactlyOnceWith(undefined, 'auth-code-1')
    } finally {
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose())
        server.closeAllConnections?.()
      })
    }
  })
})
