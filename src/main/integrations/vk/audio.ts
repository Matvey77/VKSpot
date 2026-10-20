import { session, WebContentsView, type BrowserWindow } from 'electron'

export type VKAudioTrack = {
  id?: string
  artist: string
  title: string
}

export type VKAudioResult = {
  playing: boolean
  error?: string
}

export class VKAudioPlayer {
  private view: WebContentsView | null = null
  private playing = false
  private currentKey: string | null = null

  constructor(private host: () => BrowserWindow) {}

  private ensure(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:vkspot-vk',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.view = view
    view.webContents.setUserAgent(
      view.webContents.getUserAgent().replace(/\s(?:Electron|VKSpot|vkspot)\/\S+/g, ''),
    )
    view.webContents.setAudioMuted(false)
    const allowed = (address: string) => {
      try {
        const url = new URL(address)
        if (url.protocol === 'about:') return true
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
        return /(?:^|\.)(?:vk\.com|vk\.ru|userapi\.com|vkuseraudio\.net|mycdn\.me|mail\.ru|vk\.me|v-k\.me|vkuserlive\.com|vkcache\.com|vk-cdn\.net|vkuser\.net)$/i.test(
          url.hostname,
        )
      } catch {
        return false
      }
    }
    view.webContents.on('will-navigate', (event, address) => {
      if (!allowed(address)) event.preventDefault()
    })
    view.webContents.on('will-redirect', (event, address) => {
      if (!allowed(address)) event.preventDefault()
    })
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const main = this.host()
    if (main && !main.isDestroyed()) {
      main.contentView.addChildView(view)
      // Keep offscreen desktop viewport (1280x800) at (-2000, -2000).
      // Being visible ensures Chromium AudioContext and hardware media pipeline are active.
      // Being 1280x800 ensures VK desktop UI renders properly without mobile fallbacks.
      view.setBounds({ x: -2000, y: -2000, width: 1280, height: 800 })
      view.setVisible(true)
    }
    return view
  }

  async play(track: VKAudioTrack): Promise<VKAudioResult> {
    const key = track.id || `${track.artist} - ${track.title}`
    if (this.currentKey === key && this.playing) {
      return await this.pause()
    }

    try {
      if (typeof session?.fromPartition === 'function') {
        const vkSession = session.fromPartition('persist:vkspot-vk')
        const cookies = await vkSession.cookies.get({ domain: 'vk.com' })
        const ruCookies = await vkSession.cookies.get({ domain: 'vk.ru' })
        const allCookies = [...cookies, ...ruCookies]
        const hasAuth = allCookies.some((c) =>
          ['remixsid', 'remixmid', 'remixnsid', 'remixpass', 'remixsid6', 'remixua'].includes(
            c.name,
          ),
        )
        if (!hasAuth) {
          this.playing = false
          return {
            playing: false,
            error: 'Требуется войти в VK в разделе «Подключения»',
          }
        }
      }
    } catch {
      /* ignore cookie check error */
    }

    const view = this.ensure()
    const query = `${track.artist} ${track.title}`.trim()
    const currentUrl =
      typeof view.webContents.getURL === 'function' ? view.webContents.getURL() : ''
    const onAudioPage = currentUrl.includes('vk.com/audio') || currentUrl.includes('vk.com/audios')

    try {
      if (!onAudioPage) {
        await Promise.race([
          view.webContents.loadURL('https://vk.com/audio'),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Время загрузки VK истекло')), 15000),
          ),
        ])
      }

      const script = `
        (async () => {
          const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
          const targetId = ${JSON.stringify(track.id || '')}
          const searchQuery = ${JSON.stringify(query)}

          const isBlocked = (r) => {
            const cls = (r.className || '').toLowerCase()
            return (
              /(?:blocked|unavailable|restricted|deleted|audio_claimed|audio_item_disabled)/i.test(cls) ||
              r.getAttribute('aria-disabled') === 'true' ||
              Boolean(r.querySelector('.audio_row__claimed, .audio_row_claimed, [data-testid*="Blocked"], [data-testid*="Claimed"]'))
            )
          }

          const checkPlaying = () => {
            try {
              const p = typeof window.getAudioPlayer === 'function' ? window.getAudioPlayer() : null
              if (p && typeof p.isPlaying === 'function' && p.isPlaying()) return true
            } catch {}

            try {
              const audios = Array.from(document.querySelectorAll('audio'))
              if (audios.some((a) => !a.paused && a.currentTime > 0)) return true
            } catch {}

            if (document.querySelector(
              '[data-testid="MusicTrackRow_Pause"], [aria-label*="Пауза"], [aria-label*="Pause"], .audio_row_playing, .top_audio_player_playing, [data-playing="1"]'
            )) return true

            return false
          }

          const triggerSearch = () => {
            const searchInput = document.querySelector(
              'input.ui_search_field, input#audio_search, input.audio_search__input, [data-testid="MusicSearchInput"], input[type="search"]'
            )
            if (searchInput && searchInput.value !== searchQuery) {
              try {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
                if (nativeSetter) {
                  nativeSetter.call(searchInput, searchQuery)
                } else {
                  searchInput.value = searchQuery
                }
                searchInput.dispatchEvent(new Event('input', { bubbles: true }))
                searchInput.dispatchEvent(new Event('change', { bubbles: true }))
              } catch {}
            }
          }

          const findRow = () => {
            if (targetId) {
              const byId = document.querySelector('[data-full-id="' + targetId + '"], [data-audio-id="' + targetId + '"]')
              if (byId) return byId
            }
            const allRows = Array.from(document.querySelectorAll(
              '.audio_row, .audio_item, [data-testid="MusicTrackRow"], [class*="MusicTrackRow"], [class*="audio_row"]'
            ))
            const candidateRows = allRows.filter((r) =>
              !r.closest('.audioPlaylistSnippet, aside, [data-testid*="PlaylistSnippet"], [data-testid*="Recommendation"]')
            )
            const queryNorm = searchQuery.toLowerCase().replace(/[\\s\\-_.,()]+/g, ' ')
            const words = queryNorm.split(' ').filter((w) => w.length > 1)
            if (!words.length) return candidateRows[0] || null

            // 1. Exact match of all words
            let match = candidateRows.find((r) => {
              const text = (r.textContent || '').toLowerCase().replace(/[\\s\\-_.,()]+/g, ' ')
              return words.every((w) => text.includes(w))
            })
            if (match) return match

            // 2. Partial match of majority of words
            match = candidateRows.find((r) => {
              const text = (r.textContent || '').toLowerCase().replace(/[\\s\\-_.,()]+/g, ' ')
              const matched = words.filter((w) => text.includes(w)).length
              return matched >= Math.ceil(words.length / 2)
            })
            return match || null
          }

          let row = findRow()
          if (!row && !targetId) {
            triggerSearch()
          }

          let playClicked = false

          for (let i = 0; i < 40; i++) {
            if (
              document.querySelector('.vkc__AuthRoot__content, #login_mobile, .login_form, [data-test-id="login-form"]') ||
              window.location.hostname.includes('login') ||
              window.location.hostname.includes('id.vk') ||
              window.location.pathname.includes('/join')
            ) {
              return { ok: false, error: 'Требуется войти в VK в разделе «Подключения»' }
            }

            if (!row) {
              row = findRow()
              if (!row && !targetId && i % 4 === 0) {
                triggerSearch()
              }
            }

            if (row && !playClicked) {
              if (isBlocked(row)) {
                return { ok: false, error: 'Трек заблокирован правообладателем или недоступен в вашем регионе VK.' }
              }

              try {
                const ap = typeof window.getAudioPlayer === 'function' ? window.getAudioPlayer() : null
                if (ap) {
                  if (typeof ap.setVolume === 'function') ap.setVolume(1)
                  if (typeof ap.unmute === 'function') ap.unmute()
                }
              } catch {}

              document.querySelectorAll('audio').forEach((a) => {
                a.muted = false
                a.volume = 1
              })

              const playBtn = row.querySelector(
                '.audio_row__play_btn, .audio_row__cover_back, [data-testid="MusicTrackRow_Play"], [data-testid*="Play"], [aria-label*="Воспроизвести"], [aria-label*="Play"], [aria-label*="Слушать"], .audio_play'
              )
              const clickTarget = playBtn || row
              playClicked = true
              clickTarget.click()
            }

            if (playClicked) {
              document.querySelectorAll('audio').forEach((a) => {
                a.muted = false
                a.volume = 1
                if (a.paused && a.currentTime === 0) {
                  try { a.play(); } catch {}
                }
              })

              if (checkPlaying()) {
                return { ok: true }
              }
            }

            await pause(150)
          }

          if (checkPlaying()) return { ok: true }

          if (!row) {
            return { ok: false, error: 'Трек не найден в результатах поиска VK.' }
          }
          return { ok: false, error: 'Трек не начал воспроизведение в VK. Возможно, он недоступен в вашем регионе или требует подписку VK Музыка.' }
        })()
      `
      const result = (await view.webContents.executeJavaScript(script)) as {
        ok: boolean
        error?: string
      }
      const audible =
        typeof view.webContents.isCurrentlyAudible === 'function' &&
        view.webContents.isCurrentlyAudible()
      if (result.ok || audible) {
        this.playing = true
        this.currentKey = key
        return { playing: true }
      }
      this.playing = false
      return {
        playing: false,
        error:
          result.error ||
          'Трек не начал воспроизведение в VK. Возможно, он недоступен в вашем регионе или требует подписку VK Музыка.',
      }
    } catch (error) {
      this.playing = false
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('ERR_FAILED') || msg.includes('ERR_BLOCKED_BY_CLIENT')) {
        return {
          playing: false,
          error: 'Требуется войти в VK в разделе «Подключения»',
        }
      }
      return {
        playing: false,
        error: msg.includes('ERR_NAME_NOT_RESOLVED') ? 'Не удалось связаться с серверами VK' : msg,
      }
    }
  }

  async pause(): Promise<VKAudioResult> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      this.playing = false
      return { playing: false }
    }
    try {
      await this.view.webContents.executeJavaScript(`
        try { if (typeof window.getAudioPlayer === 'function') window.getAudioPlayer().pause(); } catch {}
        try { document.querySelectorAll('audio').forEach((a) => a.pause()); } catch {}
        try {
          const pauseBtn = document.querySelector('[data-testid="MusicTrackRow_Pause"], [aria-label*="Пауза"], [aria-label*="Pause"], .top_audio_player_play')
          if (pauseBtn) pauseBtn.click()
        } catch {}
      `)
    } catch {
      /* ignore execution errors during page navigation */
    }
    this.playing = false
    return { playing: false }
  }

  async resume(): Promise<VKAudioResult> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { playing: false }
    }
    try {
      await this.view.webContents.executeJavaScript(`
        try { if (typeof window.getAudioPlayer === 'function') window.getAudioPlayer().play(); } catch {}
        try { document.querySelectorAll('audio').forEach((a) => a.play()); } catch {}
        try {
          const playBtn = document.querySelector('[data-testid="MusicTrackRow_Play"], [aria-label*="Воспроизвести"], [aria-label*="Play"], .top_audio_player_play')
          if (playBtn) playBtn.click()
        } catch {}
      `)
      this.playing = true
    } catch {
      /* ignore execution errors during page navigation */
    }
    return { playing: this.playing }
  }

  stop(): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      void this.pause()
    }
    this.playing = false
    this.currentKey = null
  }

  close(): void {
    this.stop()
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.close()
      this.view = null
    }
  }
}
