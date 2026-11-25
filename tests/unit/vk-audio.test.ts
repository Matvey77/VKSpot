import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const { mockWebContents, webContentsListeners, windowListeners, state } = vi.hoisted(() => {
  const state = {
    url: '',
    link: 'https://vk.ru/audios42?section=all',
    signIn: false,
    result: { playing: true } as { playing: boolean; error?: string },
  }
  const webContentsListeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const windowListeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const mockSession = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    on: vi.fn(),
  }
  const mockWebContents = {
    session: mockSession,
    getUserAgent: vi.fn(() => 'Mozilla/5.0 Chrome/130 Electron/44'),
    setUserAgent: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setAudioMuted: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = webContentsListeners.get(event) ?? []
      list.push(listener)
      webContentsListeners.set(event, list)
    }),
    setWindowOpenHandler: vi.fn(),
    getURL: vi.fn(() => state.url),
    isLoadingMainFrame: vi.fn(() => false),
    stop: vi.fn(),
    loadURL: vi.fn(async (address: string) => {
      state.url = address
    }),
    executeJavaScriptInIsolatedWorld: vi.fn(),
    close: vi.fn(),
  }
  return { mockWebContents, webContentsListeners, windowListeners, state }
})

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = mockWebContents
    once = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = windowListeners.get(event) ?? []
      list.push(listener)
      windowListeners.set(event, list)
    })
    isDestroyed = vi.fn(() => false)
    destroy = vi.fn(() => mockWebContents.close())
  },
}))

import { VKAudioPlayer, vkLibraryURL } from '../../src/main/integrations/vk/audio'
import { ensureVKSessionPolicy } from '../../src/main/integrations/vk/vk-session-policy'

const host = () =>
  ({ isDestroyed: () => false, once: vi.fn(), off: vi.fn() }) as unknown as BrowserWindow
beforeEach(() => {
  vi.clearAllMocks()
  webContentsListeners.clear()
  windowListeners.clear()
  state.url = ''
  state.link = 'https://vk.ru/audios42?section=all'
  state.signIn = false
  state.result = { playing: true }
  mockWebContents.loadURL.mockImplementation(async (address: string) => {
    state.url = address
  })
  mockWebContents.executeJavaScriptInIsolatedWorld.mockImplementation(
    async (_world, scripts: { code: string }[]) => {
      if (scripts[0].code.includes('function readVKLibraryLink')) {
        return { link: state.link, signIn: state.signIn }
      }
      if (scripts[0].code.includes('function playVKLibraryTrack')) return state.result
      return undefined
    },
  )
})

describe('VK audio personal-library navigation', () => {
  it('follows the public library tab on vk.ru and executes metadata-only playback in an isolated world', async () => {
    const player = new VKAudioPlayer(host)
    const track = { artist: 'Synthetic Artist', title: 'Original', duration: 223, position: 113 }
    expect(await player.play(track)).toEqual({ playing: true })
    expect(mockWebContents.loadURL.mock.calls.map(([address]) => address)).toEqual([
      'https://vk.com/audio',
      'https://vk.ru/audios42?section=all',
    ])
    expect(
      mockWebContents.executeJavaScriptInIsolatedWorld.mock.calls.every(
        ([world]) => world === 1003,
      ),
    ).toBe(true)
    const script = mockWebContents.executeJavaScriptInIsolatedWorld.mock.calls
      .map(([, scripts]) => scripts[0].code)
      .join('\n')
    expect(script).not.toContain('getAudioPlayer')
    expect(script).not.toContain('cookies')
    expect(await player.pause()).toEqual({ playing: false })
    expect(await player.resume()).toEqual({ playing: true })
    player.close()
    expect(mockWebContents.close).toHaveBeenCalledOnce()
  })

  it('uses the connected personal-library URL without opening catalogue home or searching globally', async () => {
    const player = new VKAudioPlayer(host, () => 'https://vk.ru/audios42?q=old-search')
    expect(await player.play({ id: '42_113', artist: '', title: '' })).toEqual({ playing: true })
    expect(mockWebContents.loadURL).toHaveBeenCalledExactlyOnceWith(
      'https://vk.ru/audios42?section=all',
    )
  })

  it('preserves a specific page failure and cannot resume an unconfirmed recording', async () => {
    state.result = { playing: false, error: 'Found but not playing' }
    const player = new VKAudioPlayer(host)
    expect(await player.play({ artist: 'Artist', title: 'Title' })).toEqual(state.result)
    expect(await player.resume()).toEqual({ playing: false })
    const last = mockWebContents.executeJavaScriptInIsolatedWorld.mock.lastCall?.[1][0].code
    expect(last).toContain('function stopVKAudioPage')
    expect(last).not.toContain('.play(')
  })

  it('a newer request cancels the older result and serializes page navigation', async () => {
    let finish!: (result: { playing: boolean }) => void
    let calls = 0
    mockWebContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      async (_world, scripts: { code: string }[]) => {
        if (scripts[0].code.includes('function readVKLibraryLink')) return state.link
        if (scripts[0].code.includes('function playVKLibraryTrack')) {
          if (++calls === 1)
            return new Promise((resolve) => {
              finish = resolve
            })
          return { playing: true }
        }
        return undefined
      },
    )
    const player = new VKAudioPlayer(host)
    const first = player.play({ artist: 'Artist', title: 'First' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const second = player.play({ artist: 'Artist', title: 'Second' })
    finish({ playing: true })
    expect(await first).toEqual({ playing: false })
    expect(await second).toEqual({ playing: true })
    expect(calls).toBe(2)
    player.close()
  })

  it.each(['https://vk.ru/audios42', 'https://vk.com/audios-123?section=all&q=old'])(
    'accepts a personal music URL: %s',
    (address) => {
      expect(vkLibraryURL(address)).toMatch(/^https:\/\/vk\.(?:ru|com)\/audios-?\d+\?section=all$/)
    },
  )
  it.each([
    'https://example.com/audios42',
    'https://vk.ru.evil.test/audios42',
    'http://vk.ru/audios42',
    'https://vk.ru/audio',
    'https://vk.ru/audio42_113',
    'https://user@vk.ru/audios42',
  ])('rejects unrelated or untrusted personal-library addresses: %s', (address) => {
    expect(vkLibraryURL(address)).toBeNull()
  })

  it('configures VK session policy once per session', () => {
    const fakeSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      on: vi.fn(),
    } as unknown as Electron.Session
    ensureVKSessionPolicy(fakeSession)
    ensureVKSessionPolicy(fakeSession)
    expect(fakeSession.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(fakeSession.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(fakeSession.on).toHaveBeenCalledExactlyOnceWith('will-download', expect.any(Function))
  })

  it('exits library wait loop immediately when sign-in gate is detected', async () => {
    state.link = ''
    state.signIn = true
    const player = new VKAudioPlayer(host)
    const result = await player.play({ artist: 'Artist', title: 'Song' })
    expect(result).toEqual({
      playing: false,
      error: 'Войди в VK в разделе «Подключения» и открой «Моя музыка».',
    })
    expect(mockWebContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1)
  })

  it('resets playing and currentKey on render-process-gone so the same track can play again', async () => {
    const player = new VKAudioPlayer(host)
    const track = { artist: 'Artist', title: 'Track', duration: 180, position: 1 }
    expect(await player.play(track)).toEqual({ playing: true })

    const crashHandlers = webContentsListeners.get('render-process-gone') ?? []
    expect(crashHandlers.length).toBeGreaterThan(0)
    state.url = ''
    crashHandlers.forEach((handler) => handler({}, { reason: 'crashed', exitCode: 1 }))
    expect(mockWebContents.close).toHaveBeenCalledOnce()

    // If playing/currentKey had not been cleared, calling play(track) again would call pause() instead.
    expect(await player.play(track)).toEqual({ playing: true })
    const playCalls = mockWebContents.executeJavaScriptInIsolatedWorld.mock.calls.filter(
      ([, scripts]) => scripts[0].code.includes('function playVKLibraryTrack'),
    )
    expect(playCalls).toHaveLength(2)
    expect(mockWebContents.loadURL).toHaveBeenCalledTimes(4)
    player.close()
  })

  it('translates Chromium network errors during playback without leaking raw ERR_* codes', async () => {
    mockWebContents.loadURL.mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED'))
    const player = new VKAudioPlayer(host)
    const proxyResult = await player.play({ artist: 'Artist', title: 'Track' })
    expect(proxyResult.playing).toBe(false)
    expect(proxyResult.error).toContain('прокси')
    expect(proxyResult.error).not.toContain('ERR_')

    mockWebContents.loadURL.mockRejectedValueOnce(new Error('net::ERR_TIMED_OUT'))
    const timeoutResult = await player.play({ artist: 'Artist', title: 'Track' })
    expect(timeoutResult.playing).toBe(false)
    expect(timeoutResult.error).toContain('вовремя')
    expect(timeoutResult.error).not.toContain('ERR_')
    player.close()
  })

  it('settles immediately and avoids deadlock when pause destroys the window during stopPage', async () => {
    let hung = false
    mockWebContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      async (_world, scripts: { code: string }[]) => {
        if (scripts[0].code.includes('function readVKLibraryLink')) {
          return { link: state.link, signIn: state.signIn }
        }
        if (scripts[0].code.includes('function stopVKAudioPage')) {
          if (!hung) {
            hung = true
            return new Promise(() => {})
          }
          return undefined
        }
        if (scripts[0].code.includes('function playVKLibraryTrack')) return state.result
        return undefined
      },
    )
    const player = new VKAudioPlayer(host)
    const first = player.play({ artist: 'Artist', title: 'First' })
    await vi.waitFor(() => expect(hung).toBe(true))
    expect(await player.pause()).toEqual({ playing: false })
    expect(await first).toEqual({ playing: false })

    state.url = ''
    expect(await player.play({ artist: 'Artist', title: 'Second' })).toEqual({ playing: true })
    player.close()
  })

  it('settles immediately when pause interrupts a hanging loadURL navigation', async () => {
    let hung = false
    mockWebContents.loadURL.mockImplementation(async (address: string) => {
      if (address === state.link && !hung) {
        hung = true
        return new Promise<void>(() => {})
      }
      state.url = address
    })
    const player = new VKAudioPlayer(host)
    const first = player.play({ artist: 'Artist', title: 'First' })
    await vi.waitFor(() => expect(hung).toBe(true))
    expect(await player.pause()).toEqual({ playing: false })
    expect(await first).toEqual({ playing: false })
    expect(mockWebContents.stop).toHaveBeenCalled()

    state.url = ''
    expect(await player.play({ artist: 'Artist', title: 'Second' })).toEqual({ playing: true })
    player.close()
  })

  it('settles immediately when pause interrupts a hanging library probe', async () => {
    let hung = false
    mockWebContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      async (_world, scripts: { code: string }[]) => {
        if (scripts[0].code.includes('function readVKLibraryLink')) {
          if (!hung) {
            hung = true
            return new Promise(() => {})
          }
          return { link: state.link, signIn: state.signIn }
        }
        if (scripts[0].code.includes('function playVKLibraryTrack')) return state.result
        return undefined
      },
    )
    const player = new VKAudioPlayer(host)
    const first = player.play({ artist: 'Artist', title: 'First' })
    await vi.waitFor(() => expect(hung).toBe(true))
    expect(await player.pause()).toEqual({ playing: false })
    expect(await first).toEqual({ playing: false })

    state.url = ''
    expect(await player.play({ artist: 'Artist', title: 'Second' })).toEqual({ playing: true })
    player.close()
  })

  it('reloads the clean personal-library URL when the hidden view still has an active search query', async () => {
    const player = new VKAudioPlayer(host, () => 'https://vk.ru/audios42?section=all')
    expect(await player.play({ artist: 'Artist', title: 'First' })).toEqual({ playing: true })
    state.url = 'https://vk.ru/audios42?q=First&section=all'
    expect(await player.play({ artist: 'Artist', title: 'Second' })).toEqual({ playing: true })
    expect(mockWebContents.loadURL).toHaveBeenCalledTimes(2)
    expect(mockWebContents.loadURL).toHaveBeenLastCalledWith('https://vk.ru/audios42?section=all')
    player.close()
  })

  it('clamps volume, applies DOM volume in isolated world 1003, and respects mute and pause state', async () => {
    const player = new VKAudioPlayer(host)
    expect(await player.setVolume(140)).toEqual({ volume: 100 })
    expect(mockWebContents.setAudioMuted).not.toHaveBeenCalled()

    expect(await player.play({ artist: 'Artist', title: 'Track', volume: 0 })).toEqual({
      playing: true,
    })
    expect(mockWebContents.setAudioMuted).toHaveBeenCalledWith(true)
    expect(mockWebContents.setAudioMuted).not.toHaveBeenCalledWith(false)

    expect(await player.setVolume(42)).toEqual({ volume: 42 })
    expect(mockWebContents.setAudioMuted).toHaveBeenLastCalledWith(false)
    const volumeScripts = mockWebContents.executeJavaScriptInIsolatedWorld.mock.calls.filter(
      ([world, scripts]) => world === 1003 && scripts[0].code.includes('function setVKAudioVolume'),
    )
    expect(volumeScripts.length).toBeGreaterThanOrEqual(2)
    expect(volumeScripts[volumeScripts.length - 1][1][0].code).toContain('(42)')

    expect(await player.pause()).toEqual({ playing: false })
    mockWebContents.setAudioMuted.mockClear()
    expect(await player.setVolume(65)).toEqual({ volume: 65 })
    expect(mockWebContents.setAudioMuted).not.toHaveBeenCalled()

    expect(await player.setVolume(-10)).toEqual({ volume: 0 })
    expect(await player.resume()).toEqual({ playing: true })
    expect(mockWebContents.setAudioMuted).toHaveBeenLastCalledWith(true)
    player.close()
  })
})
