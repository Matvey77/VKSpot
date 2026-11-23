import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { safeStorage, shell } from 'electron'

export type SpotifyToken = {
  access_token: string
  refresh_token: string
  expiresAt: number
  clientId: string
}

export const redirectUri = 'http://127.0.0.1:43823/callback'

export function createOAuthCallbackHandler(
  expectedState: string,
  onComplete: (error?: Error, code?: string) => void,
) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('Connection', 'close')
    try {
      if (
        req.method !== 'GET' ||
        req.headers.host !== '127.0.0.1:43823' ||
        !req.url?.startsWith('/')
      ) {
        res.writeHead(400)
        res.end('Bad request')
        return
      }
      const url = new URL(req.url, redirectUri)
      if (url.origin !== 'http://127.0.0.1:43823') {
        res.writeHead(400)
        res.end('Bad request')
        return
      }
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }
      if (url.searchParams.get('state') !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<!doctype html><meta charset="utf-8"><title>VKSpot</title><p>Не удалось подтвердить сессию входа Spotify (устаревшая или неверная ссылка). Закрой эту вкладку и повтори подключение в VKSpot.</p>',
        )
        return
      }
      const result = url.searchParams.get('code'),
        error = url.searchParams.get('error')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(
        '<!doctype html><meta charset="utf-8"><title>VKSpot</title><p>Можно вернуться в VKSpot.</p>',
        () => {
          onComplete(
            error || !result
              ? new Error('Spotify не подтвердил вход. Повтори подключение.')
              : undefined,
            result ?? undefined,
          )
        },
      )
    } catch {
      if (!res.headersSent) res.writeHead(400)
      if (!res.writableEnded) res.end('Bad request')
    }
  }
}

export function secureTokenStorageAvailable(platform: NodeJS.Platform = process.platform): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (platform !== 'linux') return true
  const backend = safeStorage.getSelectedStorageBackend()
  return backend !== 'basic_text' && backend !== 'unknown'
}

export function loadEncryptedToken(tokenPath: string): SpotifyToken | null {
  if (!existsSync(tokenPath) || !secureTokenStorageAvailable()) return null
  try {
    return JSON.parse(safeStorage.decryptString(readFileSync(tokenPath))) as SpotifyToken
  } catch {
    return null
  }
}

export function persistEncryptedToken(tokenPath: string, token: SpotifyToken): void {
  if (!secureTokenStorageAvailable())
    throw new Error(
      'ОС не предоставила защищённое хранилище. Токены не будут записаны открытым текстом.',
    )
  const encrypted = safeStorage.encryptString(JSON.stringify(token))
  mkdirSync(dirname(tokenPath), { recursive: true })
  const tempPath = `${tokenPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    writeFileSync(tempPath, encrypted, process.platform === 'win32' ? undefined : { mode: 0o600 })
    renameSync(tempPath, tokenPath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch {
      /* Best-effort cleanup of the temporary token file. */
    }
    throw error
  }
}

export function removeEncryptedToken(tokenPath: string): void {
  if (existsSync(tokenPath)) unlinkSync(tokenPath)
}

export async function authorizeSpotifyPKCE(
  clientId: string,
  fetchImplementation: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<SpotifyToken> {
  if (!/^[a-fA-F0-9]{32}$/.test(clientId))
    throw new Error('Укажи Client ID из настроек приложения Spotify Developer.')
  const verifier = randomBytes(48).toString('base64url'),
    state = randomBytes(24).toString('base64url')
  const code = await new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, value?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      server.close()
      server.closeAllConnections?.()
      if (error) reject(error)
      else resolve(value!)
    }
    const server = createServer(createOAuthCallbackHandler(state, finish))
    const timeout = setTimeout(
      () => finish(new Error('Время входа истекло. Подключись ещё раз.')),
      180000,
    )
    server.once('error', () =>
      finish(new Error('Порт 43823 занят. Закрой другое подключение и повтори вход.')),
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
  const response = await fetchImplementation('https://accounts.spotify.com/api/token', {
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
    throw new Error('Не удалось получить доступ Spotify. Проверь Client ID и Redirect URI.')
  const data = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
  return { ...data, clientId, expiresAt: Date.now() + data.expires_in * 1000 }
}
