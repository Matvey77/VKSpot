import { describe, expect, it, vi } from 'vitest'

const { mockWebContents, MockWebContentsView, mockSession } = vi.hoisted(() => {
  const mockWebContents = {
    getUserAgent: vi.fn(() => 'Mozilla/5.0 Chrome/130 Electron/44'),
    setUserAgent: vi.fn(),
    isCurrentlyAudible: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    setAudioMuted: vi.fn(),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    getURL: vi.fn(() => ''),
    loadURL: vi.fn(async () => {}),
    executeJavaScript: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
    close: vi.fn(),
  }
  class MockWebContentsView {
    webContents = mockWebContents
    setBounds = vi.fn()
    setVisible = vi.fn()
  }
  const mockSession = {
    fromPartition: vi.fn(() => ({
      cookies: {
        get: vi.fn(async () => [{ name: 'remixsid', value: 'secret' }]),
      },
    })),
  }
  return { mockWebContents, MockWebContentsView, mockSession }
})

vi.mock('electron', () => ({
  WebContentsView: MockWebContentsView,
  session: mockSession,
}))

import { VKAudioPlayer } from '../../src/main/integrations/vk/audio'
import type { BrowserWindow } from 'electron'

describe('VKAudioPlayer', () => {
  it('navigates to VK audio search and starts playback on play()', async () => {
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      contentView: {
        addChildView: vi.fn(),
      },
    } as unknown as BrowserWindow

    const player = new VKAudioPlayer(() => mockWindow)
    const result = await player.play({
      id: '123_456',
      artist: 'Miyagi & Эндшпиль',
      title: 'I Got Love',
    })

    expect(result.playing).toBe(true)
    expect(mockWebContents.loadURL).toHaveBeenCalledWith('https://vk.com/audio')
    expect(mockWebContents.executeJavaScript).toHaveBeenCalled()

    // Pausing stops playing
    const pauseResult = await player.pause()
    expect(pauseResult.playing).toBe(false)

    // Resuming sets playing back to true
    const resumeResult = await player.resume()
    expect(resumeResult.playing).toBe(true)

    // Stop resets state
    player.stop()

    // Close destroys view
    player.close()
    expect(mockWebContents.close).toHaveBeenCalled()
  })

  it('handles play failures gracefully and returns error message', async () => {
    mockWebContents.executeJavaScript.mockResolvedValueOnce({
      ok: false,
      error: 'Трек не найден в результатах поиска VK',
    })

    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      contentView: {
        addChildView: vi.fn(),
      },
    } as unknown as BrowserWindow

    const player = new VKAudioPlayer(() => mockWindow)
    const result = await player.play({
      artist: 'Unknown Artist',
      title: 'Nonexistent Song',
    })

    expect(result.playing).toBe(false)
    expect(result.error).toBe('Трек не найден в результатах поиска VK')
  })
})
