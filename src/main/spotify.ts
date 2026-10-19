import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { safeStorage, shell } from 'electron'
import type { SpotifyTrack } from '../shared/model'

type Token = { access_token: string; refresh_token: string; expiresAt: number; clientId: string }
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
export const redirectUri = 'http://127.0.0.1:43823/callback'
export class Spotify {
  private token: Token | null = null
  private verified = false
  private refreshing: Promise<void> | null = null
  private authenticating = false
  constructor(
    private tokenPath: string,
    private fetchImplementation: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  ) {
    if (existsSync(tokenPath) && safeStorage.isEncryptionAvailable()) {
      try {
        this.token = JSON.parse(safeStorage.decryptString(readFileSync(tokenPath))) as Token
      } catch {
        this.token = null
      }
    }
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
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        'ОС не предоставила защищённое хранилище. Токены не будут записаны открытым текстом.',
      )
    if (this.token)
      writeFileSync(this.tokenPath, safeStorage.encryptString(JSON.stringify(this.token)))
  }
  disconnect(): void {
    this.verified = false
    this.token = null
    if (existsSync(this.tokenPath)) unlinkSync(this.tokenPath)
  }
  async authorize(clientId: string): Promise<void> {
    if (!/^[a-fA-F0-9]{32}$/.test(clientId))
      throw new Error('Укажите Client ID из настроек приложения Spotify Developer.')
    if (this.authenticating) throw new Error('Вход уже открыт в браузере.')
    this.authenticating = true
    const verifier = randomBytes(48).toString('base64url'),
      state = randomBytes(24).toString('base64url')
    try {
      const code = await new Promise<string>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error, value?: string) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          server.close()
          if (error) reject(error)
          else resolve(value!)
        }
        const server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', redirectUri)
          if (url.pathname !== '/callback') {
            res.writeHead(404)
            res.end()
            return
          }
          if (url.searchParams.get('state') !== state) {
            res.writeHead(400)
            res.end('Invalid state')
            return
          }
          const result = url.searchParams.get('code'),
            error = url.searchParams.get('error')
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(
            '<!doctype html><meta charset="utf-8"><title>VKSpot</title><p>Можно вернуться в VKSpot.</p>',
          )
          finish(
            error || !result
              ? new Error('Spotify не подтвердил вход. Повторите подключение.')
              : undefined,
            result ?? undefined,
          )
        })
        const timeout = setTimeout(
          () => finish(new Error('Время входа истекло. Подключитесь ещё раз.')),
          180000,
        )
        server.once('error', () =>
          finish(new Error('Порт 43823 занят. Закройте другое подключение и повторите вход.')),
        )
        server.listen(43823, '127.0.0.1', () => {
          const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            state,
            code_challenge_method: 'S256',
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            scope: 'playlist-read-private playlist-modify-private user-read-private',
          })
          void shell
            .openExternal('https://accounts.spotify.com/authorize?' + params)
            .catch(() => finish(new Error('Не удалось открыть браузер.')))
        })
      })
      const response = await this.fetchImplementation('https://accounts.spotify.com/api/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok)
        throw new Error('Не удалось получить доступ Spotify. Проверьте Client ID и Redirect URI.')
      const data = (await response.json()) as {
        access_token: string
        refresh_token: string
        expires_in: number
      }
      this.token = { ...data, clientId, expiresAt: Date.now() + data.expires_in * 1000 }
      this.verified = false
      this.persist()
    } finally {
      this.authenticating = false
    }
  }
  private async refresh(): Promise<void> {
    if (!this.token) throw new Error('Подключите Spotify в настройках.')
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
      throw new Error('Сессия Spotify истекла. Подключитесь снова.')
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
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.token) throw new Error('Подключите Spotify в настройках.')
    if (this.token.expiresAt < Date.now() + 30000) {
      this.refreshing ??= this.refresh().finally(() => {
        this.refreshing = null
      })
      await this.refreshing
    }
    let response: Response
    try {
      response = await this.fetchImplementation('https://api.spotify.com/v1' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + this.token!.access_token,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      })
    } catch {
      throw new SpotifyError(
        'Соединение прервано. Запись в Spotify могла выполниться; перед продолжением нужна сверка.',
        0,
        method !== 'GET',
      )
    }
    if (response.status === 429) {
      const data = (await response.json().catch(() => ({}))) as {
        reason?: string
        error?: { reason?: string }
      }
      const delay = Number(response.headers.get('retry-after') ?? 60)
      const quota = (data.reason ?? data.error?.reason) === 'QUOTA_EXCEEDED'
      throw new SpotifyError(
        quota
          ? 'Квота Spotify исчерпана. Задание сохранено; продолжите позже.'
          : 'Spotify ограничил частоту запросов. Задание сохранено.',
        Math.max(1, Number.isFinite(delay) ? delay : 60),
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
          'Spotify недоступен из страны этого подключения. Укажите прокси вашего VPN в настройках Spotify или включите VPN для всего приложения VKSpot.',
        )
      }
      const messages: Record<number, string> = {
        401: 'Spotify отклонил сессию. Подключитесь снова.',
        403: 'Spotify отказал в доступе. Проверьте Premium владельца, разрешённых пользователей и возможности API-приложения.',
        404: 'Spotify не нашёл объект. Проверьте доступ к плейлисту.',
      }
      throw new SpotifyError(
        messages[response.status] ?? `Spotify вернул ошибку ${response.status}.`,
        0,
        method !== 'GET' && response.status >= 500,
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
      if (!name) throw new Error('Spotify не вернул сведения профиля. Повторите подключение.')
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
  async playlistItems(id: string): Promise<string[]> {
    const items: string[] = []
    let offset = 0
    for (;;) {
      const data = await this.request<{
        items: { item?: { uri: string } | null; track?: { uri: string } | null }[]
        next: string | null
      }>(`/playlists/${id}/items?limit=100&offset=${offset}`)
      items.push(...data.items.map((i) => i.item?.uri ?? i.track?.uri ?? 'unavailable'))
      if (!data.next) return items
      if (!data.items.length) throw new Error('Spotify вернул неполную страницу плейлиста.')
      offset += data.items.length
    }
  }
}
