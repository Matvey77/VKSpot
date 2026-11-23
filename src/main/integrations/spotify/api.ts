import type { SpotifyTrack } from '../../../shared/model'
import {
  authorizeSpotifyPKCE,
  createOAuthCallbackHandler,
  loadEncryptedToken,
  persistEncryptedToken,
  redirectUri,
  removeEncryptedToken,
  secureTokenStorageAvailable,
  type SpotifyToken,
} from './oauth-pkce'

export { createOAuthCallbackHandler, redirectUri, secureTokenStorageAvailable }

export class SpotifyError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
    public ambiguousWrite = false,
    public waitReason?: 'quota' | 'rate-limit',
  ) {
    super(message)
  }
}

export function parseRetryAfterSeconds(header: string | null, now = Date.now()): number {
  if (!header) return 60
  const trimmed = header.trim()
  if (!trimmed) return 60
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return Math.max(1, Math.ceil(numeric))
  const targetMs = Date.parse(trimmed)
  if (Number.isFinite(targetMs)) return Math.max(1, Math.ceil((targetMs - now) / 1000))
  return 60
}

export class Spotify {
  private token: SpotifyToken | null = null
  private verified = false
  private refreshing: Promise<void> | null = null
  private authenticating = false
  constructor(
    private tokenPath: string,
    private fetchImplementation: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  ) {
    this.token = loadEncryptedToken(tokenPath)
  }
  connected(): boolean {
    return !!this.token && this.verified
  }
  hasSession(): boolean {
    return !!this.token
  }
  invalidateAccess(): void {
    this.verified = false
  }
  private persist(): void {
    if (!this.token) return
    persistEncryptedToken(this.tokenPath, this.token)
  }
  disconnect(): void {
    this.verified = false
    this.token = null
    removeEncryptedToken(this.tokenPath)
  }
  async authorize(clientId: string): Promise<void> {
    if (!/^[a-fA-F0-9]{32}$/.test(clientId))
      throw new Error('Укажи Client ID из настроек приложения Spotify Developer.')
    if (this.authenticating) throw new Error('Вход уже открыт в браузере.')
    this.authenticating = true
    try {
      this.token = await authorizeSpotifyPKCE(clientId, this.fetchImplementation)
      this.verified = false
      this.persist()
    } finally {
      this.authenticating = false
    }
  }
  private async refresh(): Promise<void> {
    if (!this.token) throw new Error('Подключи Spotify в настройках.')
    const token = this.token
    const response = await this.fetchImplementation('https://accounts.spotify.com/api/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: token.clientId,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      this.verified = false
      throw new Error('Сессия Spotify истекла. Подключись снова.')
    }
    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
    if (this.token !== token) throw new Error('Подключение Spotify изменилось.')
    this.token = {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? token.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    this.persist()
  }
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!this.token) throw new Error('Подключи Spotify в настройках.')
    signal?.throwIfAborted()
    if (this.token.expiresAt < Date.now() + 30000) {
      this.refreshing ??= this.refresh().finally(() => {
        this.refreshing = null
      })
      await this.refreshing
    }
    signal?.throwIfAborted()
    const isWrite = method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
    const timeoutSignal = AbortSignal.timeout(30000)
    const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
    let response: Response
    try {
      response = await this.fetchImplementation('https://api.spotify.com/v1' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + this.token!.access_token,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestSignal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new SpotifyError(
        isWrite
          ? 'Соединение прервано. Запись в Spotify могла выполниться; перед продолжением нужна сверка.'
          : 'Соединение со Spotify прервано. Проверь подключение или прокси и повтори запрос.',
        0,
        isWrite,
      )
    }
    if (response.status === 429) {
      const data = (await response.json().catch(() => ({}))) as {
        reason?: string
        error?: { reason?: string }
      }
      const delay = parseRetryAfterSeconds(response.headers.get('retry-after'))
      const quota = (data.reason ?? data.error?.reason) === 'QUOTA_EXCEEDED'
      throw new SpotifyError(
        quota
          ? 'Квота Spotify исчерпана. Задание сохранено; продолжи позже.'
          : 'Spotify ограничил частоту запросов. Задание сохранено.',
        delay,
        false,
        quota ? 'quota' : 'rate-limit',
      )
    }
    if (!response.ok) {
      if (response.status === 401) this.verified = false
      const error = (await response.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      if (
        response.status === 403 &&
        /unavailable in this country/i.test(error.error?.message ?? '')
      ) {
        this.verified = false
        throw new SpotifyError(
          'Spotify недоступен из страны этого подключения. Укажи прокси своего VPN в настройках Spotify или включи VPN для всего приложения VKSpot.',
        )
      }
      const messages: Record<number, string> = {
        401: 'Spotify отклонил сессию. Подключись снова.',
        403: 'Spotify отказал в доступе. Проверь Premium владельца, разрешённых пользователей и возможности API-приложения.',
        404: 'Spotify не нашёл объект. Проверь доступ к плейлисту.',
      }
      throw new SpotifyError(
        messages[response.status] ?? `Spotify вернул ошибку ${response.status}.`,
        0,
        isWrite && response.status >= 500,
      )
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  async profile(): Promise<string> {
    try {
      const p = await this.request<{ display_name?: string; id?: string; account_id?: string }>(
        '/me',
      )
      const name = p.display_name || p.id || p.account_id
      if (!name) throw new Error('Spotify не вернул сведения профиля. Повтори подключение.')
      this.verified = true
      return name
    } catch (error) {
      this.verified = false
      throw error
    }
  }
  async search(query: string): Promise<SpotifyTrack[]> {
    const data = await this.request<{
      tracks: {
        items: {
          uri: string
          name: string
          artists: { name: string }[]
          duration_ms: number
          external_urls: { spotify: string }
          album: { name: string }
        }[]
      }
    }>('/search?' + new URLSearchParams({ q: query, type: 'track', limit: '10' }))
    return data.tracks.items
      .filter((t) => /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri))
      .map((t) => ({
        uri: t.uri,
        title: t.name,
        artists: t.artists.map((a) => a.name),
        duration: t.duration_ms / 1000,
        url: t.external_urls.spotify,
        album: t.album.name,
      }))
  }
  async playlistItems(id: string, signal?: AbortSignal): Promise<string[]> {
    const items: string[] = []
    let offset = 0
    for (;;) {
      signal?.throwIfAborted()
      const data = await this.request<{
        items: { item?: { uri: string } | null; track?: { uri: string } | null }[]
        next: string | null
      }>(`/playlists/${id}/items?limit=100&offset=${offset}`, 'GET', undefined, signal)
      items.push(...data.items.map((i) => i.item?.uri ?? i.track?.uri ?? 'unavailable'))
      if (!data.next) return items
      if (!data.items.length) throw new Error('Spotify вернул неполную страницу плейлиста.')
      offset += data.items.length
    }
  }
}
