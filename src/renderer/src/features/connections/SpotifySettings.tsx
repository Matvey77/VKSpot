import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { humanizeError } from '../../../../shared/ru'
import type { Settings } from '../../../../shared/types'
import { SpotifyIcon } from '../../components/brand/BrandIcons'
import { useProxyTester, validateProxyUrl } from './useProxyTester'

export function SpotifySettings({
  settings,
  busy,
  connected,
  save,
  connect,
  disconnect,
}: {
  settings: Settings
  busy: boolean
  connected: boolean
  save: (s: Settings) => void
  connect: () => void
  disconnect: () => void
}) {
  const [clientId, setClientId] = useState(settings.clientId)
  const [spotifyProxy, setSpotifyProxy] = useState(settings.spotifyProxy)
  const {
    testing: testingProxy,
    result: proxyResult,
    testProxy,
    clearResult: clearProxyResult,
  } = useProxyTester('spotify')

  useEffect(() => setClientId(settings.clientId), [settings.clientId])
  useEffect(() => setSpotifyProxy(settings.spotifyProxy), [settings.spotifyProxy])

  const trimmedClientId = clientId.trim()
  const trimmedProxy = spotifyProxy.trim()
  const invalidClientId = Boolean(trimmedClientId && !/^[a-fA-F0-9]{32}$/.test(trimmedClientId))
  const proxyError = validateProxyUrl(spotifyProxy)
  const unsaved = trimmedClientId !== settings.clientId || trimmedProxy !== settings.spotifyProxy

  return (
    <>
      <label className="field client-id">
        Client ID
        <input
          value={clientId}
          placeholder="32 символа из Spotify Developer"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setClientId(e.target.value)}
        />
      </label>
      <div className="redirect-info">
        <span>Добавь Redirect URI в настройках Spotify-приложения:</span>
        <code>http://127.0.0.1:43823/callback</code>
      </div>
      <div className="proxy-field-block">
        <div className="field client-id">
          <label htmlFor="spotify-proxy-input">Прокси Spotify (необязательно)</label>
          <div className="proxy-input-group">
            <input
              id="spotify-proxy-input"
              value={spotifyProxy}
              placeholder="http://127.0.0.1:2080"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(proxyError)}
              onChange={(event) => {
                setSpotifyProxy(event.target.value)
                clearProxyResult()
              }}
              aria-describedby={
                proxyError ? 'spotify-proxy-error spotify-proxy-hint' : 'spotify-proxy-hint'
              }
            />
            <button
              type="button"
              className="proxy-test-button"
              disabled={busy || testingProxy || Boolean(proxyError)}
              onClick={() => void testProxy(spotifyProxy)}
              title="Проверить сетевое подключение через этот прокси"
            >
              {testingProxy ? <Loader2 size={13} className="spinning" aria-hidden="true" /> : null}
              <span>{testingProxy ? 'Проверка…' : 'Проверить прокси'}</span>
            </button>
          </div>
        </div>
        {proxyError && (
          <p id="spotify-proxy-error" className="inline-warning" role="alert">
            {proxyError}
          </p>
        )}
        {proxyResult && (
          <div className={`proxy-result-hint ${proxyResult.ok ? 'success' : 'error'}`}>
            {proxyResult.ok ? (
              <>
                <Check size={14} aria-hidden="true" />
                <span>Подключение успешно ({proxyResult.latencyMs} мс)</span>
              </>
            ) : (
              <>
                <X size={14} aria-hidden="true" />
                <span>Ошибка подключения: {humanizeError(proxyResult.error)}</span>
              </>
            )}
          </div>
        )}
      </div>
      <p id="spotify-proxy-hint" className="helper-text">
        Адрес HTTP или SOCKS5 прокси твоего VPN. Пустое поле — системные настройки сети. Применяется
        только к Spotify.
      </p>
      <div className="button-row">
        <button
          disabled={busy || !unsaved || invalidClientId || Boolean(proxyError)}
          onClick={() =>
            save({ ...settings, clientId: trimmedClientId, spotifyProxy: trimmedProxy })
          }
        >
          Сохранить настройки Spotify
        </button>
        {connected ? (
          <button disabled={busy} onClick={disconnect}>
            Отключить Spotify
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy || !settings.clientId || unsaved}
            onClick={connect}
          >
            <SpotifyIcon size={18} />
            Войти в Spotify
          </button>
        )}
      </div>
    </>
  )
}
