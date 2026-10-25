import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
  shell: {},
}))
import { Spotify, SpotifyError } from '../../src/main/integrations/spotify/api'
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
})
