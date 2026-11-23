import { ArrowRight, Download, FileAudio, FolderOpen, LoaderCircle } from 'lucide-react'
import { formatCount, formatRecordsGenitive, pluralize } from '../../../../shared/ru'
import type { Collection, Settings, VKExportProgress } from '../../../../shared/types'
import type { ViewState } from '../../../../shared/sync'
import { SpotifyIcon, VKIcon } from '../../components/brand/BrandIcons'
import { api } from '../../state/api'
import { SpotifySettings } from './SpotifySettings'
import { VKSettings } from './VKSettings'

interface ConnectionsViewProps {
  data: ViewState
  busy: string
  collection: Collection | undefined
  vkExpected: string
  onVKExpectedChange: (value: string) => void
  invalidVKCount: boolean
  vkExpectedCount: number | null
  vkProgress: VKExportProgress | null
  onOpenVK: () => void
  onExtractVK: () => void
  onClearVK: () => void
  onCancelVKExtraction: () => void
  onSaveVKSettings: (value: Settings) => void
  onOpenSpotifyPanel: () => void
  onSaveSpotifySettings: (value: Settings) => void
  onConnectSpotify: () => void
  onDisconnectSpotify: () => void
  onOpenSpotifyDev: () => void
  onPrepareLocal: () => void
  onOpenSpotifyHelper: () => void
  onInspectHelper: () => void
}

export function ConnectionsView({
  data,
  busy,
  collection,
  vkExpected,
  onVKExpectedChange,
  invalidVKCount,
  vkExpectedCount,
  vkProgress,
  onOpenVK,
  onExtractVK,
  onClearVK,
  onCancelVKExtraction,
  onSaveVKSettings,
  onOpenSpotifyPanel,
  onSaveSpotifySettings,
  onConnectSpotify,
  onDisconnectSpotify,
  onOpenSpotifyDev,
  onPrepareLocal,
  onOpenSpotifyHelper,
  onInspectHelper,
}: ConnectionsViewProps) {
  return (
    <div className="content-page connections-page">
      <h1>Подключения</h1>
      <p className="page-description">
        Аккаунты нужны только для работы с платформами. Локальная коллекция доступна отдельно.
      </p>
      <div className="connections-grid">
        <section className="connection-section">
          <div className="section-symbol vk-symbol">
            <VKIcon size={44} />
          </div>
          <div className="section-main">
            <div className="heading-with-status">
              <h2>VK Музыка</h2>
              <span
                className={`status-badge ${
                  data.vk?.state === 'connected'
                    ? 'connected'
                    : data.vk?.state === 'sign-in'
                      ? 'attention'
                      : data.vk?.state === 'error'
                        ? 'error'
                        : data.vk?.state === 'checking'
                          ? 'checking'
                          : 'unknown'
                }`}
              >
                <span className="status-dot" />
                {data.vk?.state === 'connected'
                  ? 'Подключён'
                  : data.vk?.state === 'sign-in'
                    ? 'Требуется вход'
                    : data.vk?.state === 'error'
                      ? 'Ошибка соединения'
                      : data.vk?.state === 'checking'
                        ? 'Проверка связи…'
                        : 'Не проверен'}
              </span>
            </div>
            <p>
              Войди в отдельном окне и открой «Моя музыка». Сбор начнётся с первой записи и будет
              постепенно прокручивать список. Оставь окно VK открытым.
            </p>
            <label className="field vk-export-count">
              Число записей в VK, если известно
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                placeholder="Необязательно"
                value={vkExpected}
                disabled={busy === 'extract'}
                aria-invalid={invalidVKCount}
                onChange={(event) => onVKExpectedChange(event.target.value)}
              />
            </label>
            {invalidVKCount && (
              <p className="inline-warning">
                Укажи целое число от 1 до 1 000 000 или оставь поле пустым.
              </p>
            )}
            <div className="button-row">
              <button className="primary" disabled={!!busy} onClick={onOpenVK}>
                Открыть VK
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button disabled={!!busy || invalidVKCount} onClick={onExtractVK}>
                {busy === 'extract' ? (
                  <LoaderCircle className="spinning" size={16} aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                Выгрузить мой список
              </button>
              <button disabled={!!busy} onClick={onClearVK}>
                Выйти из VK
              </button>
            </div>
            {busy === 'extract' && (
              <div className="vk-extraction">
                <div role="status" aria-live="polite">
                  <strong>
                    Собрано: {formatCount(vkProgress?.collected ?? 0)}
                    {(vkProgress?.expected ?? vkExpectedCount) !== null
                      ? ` из ${formatRecordsGenitive((vkProgress?.expected ?? vkExpectedCount)!)}`
                      : ` ${pluralize(vkProgress?.collected ?? 0, ['запись', 'записи', 'записей'])}`}
                  </strong>
                  <p>{vkProgress?.message ?? 'Возвращаемся к началу списка…'}</p>
                </div>
                <button onClick={onCancelVKExtraction}>Остановить сбор</button>
              </div>
            )}
            <p className="helper-text">
              После выгрузки сравни количество и крайние записи. Недоступные в VK треки сохраняются
              как записи списка; для переноса понадобится собственный аудиофайл.
            </p>
            <VKSettings settings={data.settings} busy={!!busy} save={onSaveVKSettings} />
          </div>
        </section>
        <section className="connection-section">
          <div className="section-symbol spotify-symbol">
            <SpotifyIcon size={44} />
          </div>
          <div className="section-main">
            <div className="heading-with-status">
              <h2>Spotify</h2>
              <span className={`status-badge ${data.spotify.connected ? 'connected' : 'unknown'}`}>
                <span className="status-dot" />
                {data.spotify.connected
                  ? `Подключён (${data.spotify.name || 'Официальный API'})`
                  : 'Не подключён'}
              </span>
            </div>
            <p>
              Поиск через страницу Spotify работает внутри VKSpot. Если понадобится вход, он
              откроется здесь же.
            </p>
            <button onClick={onOpenSpotifyPanel}>Открыть страницу Spotify</button>
            <div className="spotify-api-block" style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 600 }}>
                Spotify API — подключение для переноса
              </h3>
              <SpotifySettings
                settings={data.settings}
                busy={!!busy}
                connected={data.spotify.connected}
                save={onSaveSpotifySettings}
                connect={onConnectSpotify}
                disconnect={onDisconnectSpotify}
              />
              <button className="text-button" onClick={onOpenSpotifyDev}>
                Открыть Spotify Developer
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
        <section className="connection-section">
          <div className="section-symbol neutral-symbol">
            <FileAudio size={28} aria-hidden="true" />
          </div>
          <div className="section-main">
            <h2>Локальные файлы</h2>
            <p>
              Привяжи файл к записи в коллекции. Подготовка создаёт копии без перекодирования и
              полный план порядка.
            </p>
            <div className="button-row">
              <button disabled={!collection || !!busy} onClick={onPrepareLocal}>
                <FolderOpen size={16} aria-hidden="true" />
                Подготовить файлы
              </button>
              <button disabled={!!busy} onClick={onOpenSpotifyHelper}>
                Открыть Spotify
              </button>
              {api.canInspectSpotify && (
                <button disabled={!!busy} onClick={onInspectHelper}>
                  Проверить окно Spotify
                </button>
              )}
            </div>
            <details className="advanced-options">
              <summary>Как работают локальные файлы</summary>
              <p className="helper-text">
                Добавление локальных файлов через API недоступно. Добавь подготовленные файлы через
                приложение Spotify.
              </p>
            </details>
          </div>
        </section>
      </div>
    </div>
  )
}

export default ConnectionsView
