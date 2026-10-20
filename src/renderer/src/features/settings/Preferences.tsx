import { Check, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings } from '../../../../shared/model'

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
