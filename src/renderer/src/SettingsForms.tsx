import { useEffect, useState } from 'react'
import { Check, Info, Loader2 } from 'lucide-react'
import type { Settings } from '../../shared/model'
import { SpotifyIcon } from './BrandIcons'

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

export function VKSettings({
  settings,
  busy,
  save,
}: {
  settings: Settings
  busy: boolean
  save: (s: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [testingVKProxy, setTestingVKProxy] = useState(false)
  const [vkProxyResult, setVkProxyResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  useEffect(() => setDraft(settings), [settings])

  const unsaved =
    draft.useProxyForVK !== settings.useProxyForVK || draft.vkProxy !== settings.vkProxy

  const handleTestVKProxy = async () => {
    setTestingVKProxy(true)
    setVkProxyResult(null)
    try {
      const res = await window.vkspot.testProxy(draft.vkProxy, 'vk')
      if (res.ok) {
        if (res.value.ok) {
          setVkProxyResult({ ok: true, latencyMs: res.value.latencyMs })
        } else {
          setVkProxyResult({ ok: false, error: res.value.error })
        }
      } else {
        setVkProxyResult({ ok: false, error: res.error })
      }
    } catch (e) {
      setVkProxyResult({ ok: false, error: e instanceof Error ? e.message : 'Ошибка проверки' })
    } finally {
      setTestingVKProxy(false)
    }
  }

  return (
    <div className="vk-proxy-block" style={{ marginTop: '20px' }}>
      <h3 style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 600 }}>
        Сетевое подключение к VK
      </h3>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.useProxyForVK}
          onChange={(e) => setDraft({ ...draft, useProxyForVK: e.target.checked })}
        />
        Использовать прокси для VK
      </label>
      <p className="helper-text">
        По умолчанию выключено. Для стабильной работы VK и воспроизведения музыки рекомендуется
        прямое соединение без прокси.
      </p>
      {draft.useProxyForVK && (
        <div className="proxy-field-block" style={{ marginTop: '12px' }}>
          <div className="field">
            <label htmlFor="vk-proxy-input">Прокси VK (HTTP или SOCKS5)</label>
            <div className="proxy-input-group">
              <input
                id="vk-proxy-input"
                value={draft.vkProxy}
                placeholder="http://127.0.0.1:2080"
                onChange={(e) => {
                  setDraft({ ...draft, vkProxy: e.target.value.trim() })
                  setVkProxyResult(null)
                }}
              />
              <button
                type="button"
                className="proxy-test-button"
                disabled={busy || testingVKProxy}
                onClick={handleTestVKProxy}
                title="Проверить доступность серверов VK через этот прокси"
              >
                {testingVKProxy ? <Loader2 size={13} className="spin" /> : null}
                <span>{testingVKProxy ? 'Проверка…' : 'Проверить VK'}</span>
              </button>
            </div>
          </div>
          {vkProxyResult && (
            <div className={`proxy-result-hint ${vkProxyResult.ok ? 'success' : 'error'}`}>
              {vkProxyResult.ok
                ? `✓ Подключение к VK успешно (${vkProxyResult.latencyMs} мс)`
                : `✕ Ошибка подключения к VK: ${vkProxyResult.error}`}
            </div>
          )}
        </div>
      )}
      <div className="button-row" style={{ marginTop: '12px' }}>
        <button disabled={busy || !unsaved} onClick={() => save(draft)}>
          Сохранить настройки сети VK
        </button>
      </div>
    </div>
  )
}

export function Preferences({
  settings,
  busy,
  save,
}: {
  settings: Settings
  busy: boolean
  save: (s: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => setDraft(settings), [settings])

  return (
    <form
      className="settings-section"
      onSubmit={(e) => {
        e.preventDefault()
        save(draft)
      }}
    >
      <h2>Рабочее пространство</h2>
      <div className="search-provider-section">
        <div className="search-provider-header">
          <label className="search-provider-label">Способ поиска в Spotify</label>
          <span className="search-provider-hint">
            Выберите механизм сопоставления и переноса треков
          </span>
        </div>

        <div
          className="search-provider-cards"
          role="radiogroup"
          aria-label="Способ поиска в Spotify"
        >
          <div
            className={`provider-card ${draft.searchProvider === 'browser' ? 'active' : ''}`}
            onClick={() => setDraft({ ...draft, searchProvider: 'browser' })}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                setDraft({ ...draft, searchProvider: 'browser' })
              }
            }}
            role="radio"
            aria-checked={draft.searchProvider === 'browser'}
            tabIndex={0}
            title="Поиск через встроенный веб-плеер Spotify без API ключей"
          >
            <div className="provider-card-top">
              <div className="provider-radio-circle">
                <div className="provider-radio-dot" />
              </div>
              <div className="provider-title-wrap">
                <div className="provider-title-row">
                  <span className="provider-title">Встроенный веб-плеер</span>
                  <span className="provider-badge provider-badge-recommended">Без API ключей</span>
                </div>
                <p className="provider-subtitle">
                  Поиск выполняется через защищенный браузерный модуль Spotify внутри VKSpot
                </p>
              </div>
            </div>

            <div className="provider-divider" />

            <div className="provider-features">
              <div className="provider-feature-item positive">
                <Check size={14} className="feature-icon positive" />
                <span>Не требует регистрации в Spotify Developer и Client ID</span>
              </div>
              <div className="provider-feature-item positive">
                <Check size={14} className="feature-icon positive" />
                <span>Быстрый запуск — достаточно войти в аккаунт Spotify</span>
              </div>
              <div className="provider-feature-item neutral">
                <Info size={14} className="feature-icon neutral" />
                <span>Плейлист формируется в приложении при экспорте результатов</span>
              </div>
            </div>
          </div>

          <div
            className={`provider-card ${draft.searchProvider === 'api' ? 'active' : ''}`}
            onClick={() => setDraft({ ...draft, searchProvider: 'api' })}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                setDraft({ ...draft, searchProvider: 'api' })
              }
            }}
            role="radio"
            aria-checked={draft.searchProvider === 'api'}
            tabIndex={0}
            title="Официальный Web API со сборкой плейлистов в аккаунте"
          >
            <div className="provider-card-top">
              <div className="provider-radio-circle">
                <div className="provider-radio-dot" />
              </div>
              <div className="provider-title-wrap">
                <div className="provider-title-row">
                  <span className="provider-title">Официальный Spotify API</span>
                  <span className="provider-badge provider-badge-api">Полная синхронизация</span>
                </div>
                <p className="provider-subtitle">
                  Прямое взаимодействие с серверами через официальный протокол Spotify Web API
                </p>
              </div>
            </div>

            <div className="provider-divider" />

            <div className="provider-features">
              <div className="provider-feature-item positive">
                <Check size={14} className="feature-icon positive" />
                <span>Автоматическое создание плейлиста прямо в вашем аккаунте</span>
              </div>
              <div className="provider-feature-item positive">
                <Check size={14} className="feature-icon positive" />
                <span>Прямое добавление найденных треков в фоновом режиме</span>
              </div>
              <div className="provider-feature-item neutral">
                <Info size={14} className="feature-icon neutral" />
                <span>Требует указания Client ID разработчика и учитывает Rate Limit</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <label className="field">
        Название нового плейлиста
        <input
          required
          maxLength={200}
          value={draft.playlistName}
          onChange={(e) => setDraft({ ...draft, playlistName: e.target.value })}
        />
      </label>
      <label className="field">
        Пауза между поисковыми запросами, секунд
        <input
          type="number"
          min={1}
          max={60}
          step={1}
          value={draft.searchDelayMs / 1000}
          onChange={(e) => setDraft({ ...draft, searchDelayMs: Number(e.target.value) * 1000 })}
        />
      </label>
      <p className="helper-text">
        Spotify задаёт собственные квоты. Уменьшение паузы не гарантирует ускорение.
      </p>
      <label className="check-field auto-search-preference">
        <input
          type="checkbox"
          checked={draft.autoResumeSearch}
          onChange={(event) => setDraft({ ...draft, autoResumeSearch: event.target.checked })}
        />
        Автоматически продолжать фоновый поиск
      </label>
      <p className="helper-text">
        После ожидания Spotify и перезапуска приложения поиск продолжится с сохранённой позиции.
        Ручная пауза останавливает его до команды «Продолжить».
      </p>
      <label className="field">
        Оформление
        <select
          value={draft.theme}
          onChange={(e) => setDraft({ ...draft, theme: e.target.value as Settings['theme'] })}
        >
          <option value="light">Светлое</option>
          <option value="dark">Тёмное</option>
        </select>
      </label>

      <div className="settings-subsection" style={{ marginTop: '24px' }}>
        <h2>Правила сопоставления</h2>
        <p className="helper-text">
          Эвристики для распознавания совпадающих записей между VK и Spotify. Отключите ненужные
          правила, если они приводят к нежелательным совпадениям.
        </p>
        <div className="matching-rules-list">
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.diacritics}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: { ...draft.matchingRules, diacritics: e.target.checked },
                })
              }
            />
            <span>Очистка диакритических знаков и умлаутов (ë → e, ä → a, é → e)</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.homoglyphs}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: { ...draft.matchingRules, homoglyphs: e.target.checked },
                })
              }
            />
            <span>Нормализация визуально схожих букв / гомоглифов (латиница и кириллица)</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.featDeduplication}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: { ...draft.matchingRules, featDeduplication: e.target.checked },
                })
              }
            />
            <span>Выделение и дедупликация соисполнителей (feat., ft., featuring, with)</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.identicalVersions}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: { ...draft.matchingRules, identicalVersions: e.target.checked },
                })
              }
            />
            <span>Сверка типа версии (Original Mix, Radio Edit, Club Mix, Sped Up, Slowed)</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.remixPunctuation}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: { ...draft.matchingRules, remixPunctuation: e.target.checked },
                })
              }
            />
            <span>Упрощение пунктуации ремиксов ([GOSHA edit] vs (GOSHA edit) vs - edit)</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.matchingRules.extendedDurationTolerance}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchingRules: {
                    ...draft.matchingRules,
                    extendedDurationTolerance: e.target.checked,
                  },
                })
              }
            />
            <span>Расширенный допуск длительности (до 5 секунд вместо 2 при точном названии)</span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button className="primary" disabled={busy}>
          Сохранить настройки
          <Check size={16} />
        </button>
      </div>
    </form>
  )
}

export function PlaylistRecovery({
  busy,
  recover,
}: {
  busy: boolean
  recover: (playlistId: string) => void
}) {
  const [value, setValue] = useState('')
  const id = value.match(/(?:playlist\/)?([A-Za-z0-9]{22})(?:\?|$)/)?.[1] ?? ''
  return (
    <form
      className="recovery-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (id) recover(id)
      }}
    >
      <label className="field">
        Ссылка или ID созданного плейлиста
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://open.spotify.com/playlist/…"
        />
      </label>
      <button disabled={busy || !id}>Связать и проверить</button>
    </form>
  )
}
