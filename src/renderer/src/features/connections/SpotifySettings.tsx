import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings } from '../../../../shared/model'
import { SpotifyIcon } from '../../components/brand/BrandIcons'

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
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyResult, setProxyResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  useEffect(() => setClientId(settings.clientId), [settings.clientId])
  useEffect(() => setSpotifyProxy(settings.spotifyProxy), [settings.spotifyProxy])
  const unsaved = clientId !== settings.clientId || spotifyProxy !== settings.spotifyProxy

  const handleTestProxy = async () => {
    setTestingProxy(true)
    setProxyResult(null)
    try {
      const res = await window.vkspot.testProxy(spotifyProxy, 'spotify')
      if (res.ok) {
        if (res.value.ok) {
          setProxyResult({ ok: true, latencyMs: res.value.latencyMs })
        } else {
          setProxyResult({ ok: false, error: res.value.error })
        }
      } else {
        setProxyResult({ ok: false, error: res.error })
      }
    } catch (e) {
      setProxyResult({ ok: false, error: e instanceof Error ? e.message : 'Ошибка проверки' })
    } finally {
      setTestingProxy(false)
    }
  }

  return (
    <>
      <label className="field client-id">
        Client ID
        <input
          value={clientId}
          placeholder="32 символа из Spotify Developer"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setClientId(e.target.value.trim())}
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
              onChange={(event) => {
                setSpotifyProxy(event.target.value.trim())
                setProxyResult(null)
              }}
              aria-describedby="spotify-proxy-hint"
            />
            <button
              type="button"
              className="proxy-test-button"
              disabled={busy || testingProxy}
              onClick={handleTestProxy}
              title="Проверить сетевое подключение через этот прокси"
            >
              {testingProxy ? <Loader2 size={13} className="spin" /> : null}
              <span>{testingProxy ? 'Проверка…' : 'Проверить прокси'}</span>
            </button>
          </div>
        </div>
        {proxyResult && (
          <div className={`proxy-result-hint ${proxyResult.ok ? 'success' : 'error'}`}>
            {proxyResult.ok
              ? `✓ Подключение успешно (${proxyResult.latencyMs} мс)`
              : `✕ Ошибка подключения: ${proxyResult.error}`}
          </div>
        )}
      </div>
      <p id="spotify-proxy-hint" className="helper-text">
        Адрес HTTP или SOCKS5 прокси вашего VPN. Пустое поле — системные настройки сети. Применяется
        только к Spotify.
      </p>
      <div className="button-row">
        <button
          disabled={busy || !unsaved || (!!clientId && !/^[a-fA-F0-9]{32}$/.test(clientId))}
          onClick={() => save({ ...settings, clientId, spotifyProxy })}
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
