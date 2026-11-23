import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import { proxySchema, settingsSchema } from '../../src/shared/model'

const { ipcHandlers, mockTestSession, browserListeners, mockBrowserWebContents, browserLoadUrl } =
  vi.hoisted(() => {
    const ipcHandlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
    const mockTestSession = {
      setProxy: vi.fn(async () => {}),
      fetch: vi.fn(),
      closeAllConnections: vi.fn(async () => {}),
    }
    const browserListeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const browserLoadUrl = vi.fn(async () => {})
    const mockBrowserWebContents = {
      isDestroyed: vi.fn(() => false),
      getUserAgent: vi.fn(() => 'Mozilla/5.0 Chrome/130 Electron/44'),
      setUserAgent: vi.fn(),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        const list = browserListeners.get(event) ?? []
        list.push(listener)
        browserListeners.set(event, list)
      }),
      setWindowOpenHandler: vi.fn(),
      session: {
        setPermissionRequestHandler: vi.fn(),
        on: vi.fn(),
        webRequest: { onHeadersReceived: vi.fn() },
      },
      setAudioMuted: vi.fn(),
      loadURL: browserLoadUrl,
      getURL: vi.fn(() => 'about:blank'),
      isLoading: vi.fn(() => false),
      stop: vi.fn(),
      close: vi.fn(),
      executeJavaScriptInIsolatedWorld: vi.fn(),
    }
    return {
      ipcHandlers,
      mockTestSession,
      browserListeners,
      mockBrowserWebContents,
      browserLoadUrl,
    }
  })

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: vi.fn(
      (channel: string, listener: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
        ipcHandlers.set(channel, listener)
      },
    ),
  },
  session: {
    defaultSession: mockTestSession,
    fromPartition: vi.fn(() => mockTestSession),
  },
  WebContentsView: class {
    webContents = mockBrowserWebContents
    setBounds = vi.fn()
    setVisible = vi.fn()
  },
}))

import { createHandler } from '../../src/main/ipc/router'
import { testProxy } from '../../src/main/platform/network'
import { SpotifyBrowser } from '../../src/main/integrations/spotify/browser'

beforeEach(() => {
  vi.clearAllMocks()
  ipcHandlers.clear()
  browserListeners.clear()
})

describe('IPC, proxy, and Spotify browser Russian error localization', () => {
  it('humanizes ZodError and raw network/English errors in createHandler', async () => {
    const fakeMainFrame = { url: 'http://127.0.0.1:5173/' }
    const fakeMain = {
      isDestroyed: () => false,
      webContents: { mainFrame: fakeMainFrame },
    } as unknown as BrowserWindow
    const handler = createHandler(fakeMain, { devRendererUrl: 'http://127.0.0.1:5173' })

    handler('renameCollection', (_id, name) => {
      z.object({ playlistName: z.string().min(1) }).parse({ playlistName: name })
    })
    handler('testProxy', (url) => {
      proxySchema.parse(url)
      return { ok: true, latencyMs: 1, status: 200 }
    })
    handler('openExternal', () => {
      throw new Error('net::ERR_TIMED_OUT')
    })

    const fakeEvent = { sender: fakeMain.webContents, senderFrame: fakeMainFrame }
    const zodResult = (await ipcHandlers.get('vkspot:renameCollection')!(fakeEvent, 'id', '')) as {
      ok: false
      error: string
    }
    expect(zodResult.ok).toBe(false)
    expect(zodResult.error).toBe(
      'Некорректные данные: название плейлиста: значение слишком маленькое или пустое.',
    )

    const proxyResult = (await ipcHandlers.get('vkspot:testProxy')!(
      fakeEvent,
      'ftp://bad-proxy',
    )) as { ok: false; error: string }
    expect(proxyResult.ok).toBe(false)
    expect(proxyResult.error).toContain(
      'Укажи HTTP или SOCKS5 адрес прокси без логина, пароля и пути.',
    )
    expect(
      settingsSchema.safeParse({
        clientId: '',
        spotifyProxy: 'http://user:pass@127.0.0.1:2080',
        playlistName: 'Test',
        searchDelayMs: 5000,
        theme: 'light',
      }).error?.issues[0].message,
    ).toBe('Укажи HTTP или SOCKS5 адрес прокси без логина, пароля и пути.')

    const netResult = (await ipcHandlers.get('vkspot:openExternal')!(
      fakeEvent,
      'https://open.spotify.com',
    )) as { ok: false; error: string }
    expect(netResult.ok).toBe(false)
    expect(netResult.error).toContain('вовремя')
    expect(netResult.error).not.toContain('ERR_')
  })

  it('translates Chromium, timeout, and cause network errors in testProxy', async () => {
    mockTestSession.fetch.mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED'))
    const proxyRes = await testProxy('http://127.0.0.1:2080', 'spotify')
    expect(proxyRes.ok).toBe(false)
    if (!proxyRes.ok) {
      expect(proxyRes.error).toContain('прокси')
      expect(proxyRes.error).not.toContain('ERR_')
    }

    mockTestSession.fetch.mockRejectedValueOnce(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }),
      }),
    )
    const refusedRes = await testProxy('http://127.0.0.1:2080', 'vk')
    expect(refusedRes.ok).toBe(false)
    if (!refusedRes.ok) {
      expect(refusedRes.error).toContain('отклонил соединение')
    }

    mockTestSession.fetch.mockRejectedValueOnce(
      new DOMException('The user aborted a request.', 'AbortError'),
    )
    const abortRes = await testProxy('http://127.0.0.1:2080', 'spotify')
    expect(abortRes.ok).toBe(false)
    if (!abortRes.ok) {
      expect(abortRes.error).toContain('прерван')
    }

    vi.useFakeTimers()
    try {
      mockTestSession.fetch.mockImplementationOnce(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      )
      const pending = testProxy('http://127.0.0.1:2080', 'spotify')
      await vi.advanceTimersByTimeAsync(8000)
      const timeoutRes = await pending
      expect(timeoutRes.ok).toBe(false)
      if (!timeoutRes.ok) {
        expect(timeoutRes.error).toContain('вовремя')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('translates did-fail-load and loadURL failures in SpotifyBrowser without leaking ERR_*', async () => {
    const fakeHost = () =>
      ({
        isDestroyed: () => false,
        contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      }) as unknown as BrowserWindow
    const browser = new SpotifyBrowser(fakeHost, () => {})

    browserLoadUrl.mockRejectedValueOnce(
      new Error('ERR_CONNECTION_RESET (-101) loading https://open.spotify.com/search'),
    )
    await browser.show({ x: 0, y: 0, width: 800, height: 600 })
    await vi.waitFor(() => expect(browser.snapshot().state).toBe('attention'))
    expect(browser.snapshot().message).toContain('прервано')
    expect(browser.snapshot().message).not.toContain('ERR_')

    const failListeners = browserListeners.get('did-fail-load') ?? []
    expect(failListeners.length).toBeGreaterThan(0)
    failListeners[0]({}, -106, '', 'https://open.spotify.com/search', true)
    expect(browser.snapshot().message).toContain('Нет подключения к интернету')
    expect(browser.snapshot().message).not.toContain('-106')

    browserLoadUrl.mockRejectedValueOnce(
      new Error('ERR_FAILED (-130) loading https://open.spotify.com/search'),
    )
    await expect(browser.reload()).rejects.toThrow('прокси')
    expect(browser.snapshot().message).toContain('прокси')
    expect(browser.snapshot().message).not.toContain('ERR_')

    vi.useFakeTimers()
    try {
      await browser.show(null)
      browserLoadUrl.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))
      const searchPromise = browser.search('Artist Song')
      const settled = searchPromise.catch((err: unknown) => err)
      await vi.advanceTimersByTimeAsync(2000)
      const err = await settled
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain('найти адрес сервера')
      expect((err as Error).message).not.toContain('ERR_')
    } finally {
      vi.useRealTimers()
    }
  })
})
