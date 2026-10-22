import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const { mockWebContents, state } = vi.hoisted(() => {
  const state = {
    url: '',
    link: 'https://vk.ru/audios42?section=all',
    result: { playing: true } as { playing: boolean; error?: string },
  }
  const mockWebContents = {
    getUserAgent: vi.fn(() => 'Mozilla/5.0 Chrome/130 Electron/44'),
    setUserAgent: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setAudioMuted: vi.fn(),
    on: vi.fn(),
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
  return { mockWebContents, state }
})

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = mockWebContents
    once = vi.fn()
    isDestroyed = vi.fn(() => false)
    destroy = vi.fn(() => mockWebContents.close())
  },
}))

import { VKAudioPlayer, vkLibraryURL } from '../../src/main/integrations/vk/audio'

const host = () =>
  ({ isDestroyed: () => false, once: vi.fn(), off: vi.fn() }) as unknown as BrowserWindow
beforeEach(() => {
  vi.clearAllMocks()
  state.url = ''
  state.link = 'https://vk.ru/audios42?section=all'
  state.result = { playing: true }
  mockWebContents.executeJavaScriptInIsolatedWorld.mockImplementation(
    async (_world, scripts: { code: string }[]) => {
      if (scripts[0].code.includes('function readVKLibraryLink')) return state.link
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
})
