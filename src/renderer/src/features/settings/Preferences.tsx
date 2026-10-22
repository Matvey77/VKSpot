import {
  Check,
  HardDrive,
  ListMusic,
  Palette,
  Search,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings } from '../../../../shared/model'

const sections = [
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'matching', label: 'Сопоставление', icon: SlidersHorizontal },
  { id: 'transfer', label: 'Перенос', icon: ListMusic },
  { id: 'appearance', label: 'Оформление', icon: Palette },
  { id: 'storage', label: 'Хранилище', icon: HardDrive },
] as const
type Section = (typeof sections)[number]['id']
const rules = [
  {
    key: 'diacritics',
    name: 'Игнорировать диакритику',
    description: 'Считать ë и e, ä и a, é и e одинаковыми при сравнении.',
  },
  {
    key: 'homoglyphs',
    name: 'Учитывать похожие буквы',
    description: 'Распознавать визуально похожие символы кириллицы и латиницы.',
  },
  {
    key: 'featDeduplication',
    name: 'Объединять соисполнителей и продюсеров',
    description: 'Учитывать feat., ft., with и prod. by в названии или списке исполнителей.',
  },
  {
    key: 'identicalVersions',
    name: 'Сравнивать тип версии',
    description: 'Учитывать Original Mix, Radio Edit, Club Mix, Sped Up и Slowed.',
  },
  {
    key: 'remixPunctuation',
    name: 'Игнорировать оформление тегов ремикса',
    description: 'Считать [GOSHA edit], (GOSHA edit) и — edit вариантами записи тега.',
  },
  {
    key: 'extendedDurationTolerance',
    name: 'Допуск длительности до 5 секунд',
    description: 'Вместо 2 секунд при точном совпадении названия.',
  },
  {
    key: 'transliteration',
    name: 'Транслитерация названий',
    description:
      'Сопоставлять кириллицу и латиницу («На заре» ↔ «Na Zare») при совпадении исполнителя.',
  },
] as const

export function Preferences({
  settings,
  dataPath,
  busy,
  save,
}: {
  settings: Settings
  dataPath: string
  busy: boolean
  save: (settings: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [section, setSection] = useState<Section>('search')
  const [error, setError] = useState('')
  useEffect(() => setDraft(settings), [settings])
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const edit = (patch: Partial<Settings>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError('')
  }
  const selectSection = (event: React.KeyboardEvent, index: number) => {
    const direction = ['ArrowDown', 'ArrowRight'].includes(event.key)
      ? 1
      : ['ArrowUp', 'ArrowLeft'].includes(event.key)
        ? -1
        : 0
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? sections.length - 1
          : direction
            ? (index + direction + sections.length) % sections.length
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    setSection(sections[nextIndex].id)
    document.getElementById(`settings-tab-${sections[nextIndex].id}`)?.focus()
  }
  return (
    <form
      className="preferences-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.playlistName.trim()) {
          setSection('transfer')
          setError('Укажи название нового плейлиста.')
          return
        }
        if (
          !Number.isFinite(draft.searchDelayMs) ||
          draft.searchDelayMs < 1000 ||
          draft.searchDelayMs > 60000
        ) {
          setSection('search')
          setError('Пауза между запросами должна быть от 1 до 60 секунд.')
          return
        }
        save(draft)
      }}
    >
      <div className="preferences-layout">
        <div
          className="preferences-navigation"
          role="tablist"
          aria-label="Разделы настроек"
          aria-orientation="vertical"
        >
          {sections.map((item, index) => (
            <button
              key={item.id}
              type="button"
              id={`settings-tab-${item.id}`}
              role="tab"
              aria-selected={section === item.id}
              aria-controls={`settings-panel-${item.id}`}
              tabIndex={section === item.id ? 0 : -1}
              onClick={() => setSection(item.id)}
              onKeyDown={(event) => selectSection(event, index)}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </div>
        <section
          className="preferences-panel"
          role="tabpanel"
          id={`settings-panel-${section}`}
          aria-labelledby={`settings-tab-${section}`}
          tabIndex={0}
        >
          {section === 'search' && (
            <>
              <h2>Поиск в Spotify</h2>
              <p className="preferences-intro">
                Выбери, как находить варианты. Способ поиска не меняет принятые решения и исходные
                записи.
              </p>
              <fieldset className="preferences-providers">
                <legend>Способ поиска в Spotify</legend>
                <div className="preferences-provider-options">
                  <label
                    className={`preferences-provider ${draft.searchProvider === 'browser' ? 'selected' : ''}`}
                  >
                    <span>
                      <input
                        type="radio"
                        name="search-provider"
                        value="browser"
                        checked={draft.searchProvider === 'browser'}
                        onChange={() => edit({ searchProvider: 'browser' })}
                      />
                      <strong>Страница Spotify</strong>
                    </span>
                    <small>
                      Работает во встроенном окне. Client ID не нужен; вход и проверка доступны
                      здесь же.
                    </small>
                  </label>
                  <label
                    className={`preferences-provider ${draft.searchProvider === 'api' ? 'selected' : ''}`}
                  >
                    <span>
                      <input
                        type="radio"
                        name="search-provider"
                        value="api"
                        checked={draft.searchProvider === 'api'}
                        onChange={() => edit({ searchProvider: 'api' })}
                      />
                      <strong>Spotify API</strong>
                    </span>
                    <small>Нужно подключение аккаунта и Client ID в разделе «Подключения».</small>
                  </label>
                </div>
              </fieldset>
              <div className="preferences-setting-row">
                <div>
                  <h3>Интервал запросов</h3>
                  <p>
                    Spotify задаёт свои квоты. Более короткая пауза не гарантирует быстрый поиск.
                  </p>
                </div>
                <label className="field">
                  Пауза между запросами, секунд
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    required
                    value={draft.searchDelayMs / 1000}
                    onChange={(event) => edit({ searchDelayMs: Number(event.target.value) * 1000 })}
                  />
                </label>
              </div>
              <label className="preferences-check-row">
                <input
                  type="checkbox"
                  checked={draft.autoResumeSearch}
                  onChange={(event) => edit({ autoResumeSearch: event.target.checked })}
                  aria-label="Автоматически продолжать фоновый поиск"
                />
                <span>
                  <strong>Автоматически продолжать фоновый поиск</strong>
                  <small>
                    После ожидания Spotify или перезапуска — с сохранённого места. Ручная пауза
                    остаётся до команды «Продолжить».
                  </small>
                </span>
              </label>
              <p className="preferences-note">
                Для создания плейлиста подключение Spotify API нужно при любом способе поиска.
              </p>
            </>
          )}
          {section === 'matching' && (
            <>
              <h2>Сопоставление записей</h2>
              <p className="preferences-intro">
                Эти правила сравнивают описания, а не аудио. Отключи правило, если оно даёт
                нежелательные совпадения. Оригинал из VK не меняется.
              </p>
              <div className="preferences-rules">
                {rules.map((rule) => (
                  <label className="preferences-check-row" key={rule.key}>
                    <input
                      type="checkbox"
                      checked={draft.matchingRules[rule.key]}
                      onChange={(event) =>
                        edit({
                          matchingRules: {
                            ...draft.matchingRules,
                            [rule.key]: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      <strong>{rule.name}</strong>
                      <small>{rule.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          {section === 'transfer' && (
            <>
              <h2>Новый плейлист</h2>
              <p className="preferences-intro">
                Название по умолчанию для переноса в Spotify. Состав плейлиста проверяется отдельно
                перед созданием.
              </p>
              <label className="field preferences-wide-field">
                Название нового плейлиста
                <input
                  required
                  maxLength={200}
                  value={draft.playlistName}
                  onChange={(event) => edit({ playlistName: event.target.value })}
                />
              </label>
              <p className="preferences-note">
                В перенос попадут только включённые записи с выбранным назначением. Локальные файлы
                готовятся отдельно; их пути и порядок сохраняются в плане.
              </p>
            </>
          )}
          {section === 'appearance' && (
            <>
              <h2>Оформление приложения</h2>
              <p className="preferences-intro">
                Выбери тему для всего рабочего пространства. Она применится после сохранения.
              </p>
              <label className="field preferences-wide-field">
                Тема интерфейса
                <select
                  aria-label="Тема интерфейса"
                  value={draft.theme}
                  onChange={(event) => edit({ theme: event.target.value as Settings['theme'] })}
                >
                  <option value="light">Светлая</option>
                  <option value="dark">Тёмная</option>
                </select>
              </label>
            </>
          )}
          {section === 'storage' && (
            <>
              <h2>Данные на этом компьютере</h2>
              <p className="preferences-intro">
                Исходные списки, решения и история правок хранятся локально. Учётные данные Spotify
                защищены средствами системы.
              </p>
              <h3>Папка данных приложения</h3>
              <code className="preferences-data-path">{dataPath}</code>
              <p className="preferences-note">
                Резервная копия и экспорт доступны в «Коллекции → Параметры коллекции». Аудиофайлы в
                резервную копию JSON не входят.
              </p>
            </>
          )}
          {error && (
            <p className="preferences-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      <footer className="preferences-save-bar">
        <span role="status">
          {dirty ? 'Есть несохранённые изменения' : 'Нет несохранённых изменений'}
        </span>
        <div className="button-row">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => {
              setDraft(settings)
              setError('')
            }}
          >
            <Undo2 size={15} />
            Отменить изменения
          </button>
          <button className="primary" disabled={busy || !dirty}>
            <Check size={16} />
            Сохранить настройки
          </button>
        </div>
      </footer>
    </form>
  )
}
