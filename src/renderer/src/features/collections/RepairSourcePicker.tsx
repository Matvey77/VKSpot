import { CheckCircle2, LoaderCircle, RefreshCw, SlidersHorizontal, Upload } from 'lucide-react'
import { useState } from 'react'
import type { VKExportProgress, VKStatus } from '../../../../shared/types'
import { VKIcon } from '../../components/brand/BrandIcons'

const count = (number: number) => number.toLocaleString('ru-RU')

function parsePositiveInt(raw: string, max = 1_000_000): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < 1 || value > max) return null
  return value
}

interface RepairSourcePickerProps {
  totalCount: number
  resolvedCount: number
  busy: string
  vkStatus?: VKStatus
  vkProgress: VKExportProgress | null
  onSelectFile: () => void
  onOpenVK: () => void
  onExtractVK: (options?: { rangeFrom?: number; rangeTo?: number; limit?: number }) => void
  onCancelVKExtraction: () => void
}

export function RepairSourcePicker({
  totalCount,
  resolvedCount,
  busy,
  vkStatus,
  vkProgress,
  onSelectFile,
  onOpenVK,
  onExtractVK,
  onCancelVKExtraction,
}: RepairSourcePickerProps) {
  const [rangeMode, setRangeMode] = useState<'all' | 'firstN' | 'custom'>('all')
  const [firstNInput, setFirstNInput] = useState('100')
  const [rangeFromInput, setRangeFromInput] = useState('1')
  const [rangeToInput, setRangeToInput] = useState('100')

  const isVKConnected = vkStatus?.state === 'connected'
  const isExtracting = busy === 'extract'

  const firstNValue = parsePositiveInt(firstNInput, 100000)
  const rangeFromValue = parsePositiveInt(rangeFromInput)
  const rangeToValue = parsePositiveInt(rangeToInput)
  const validCustomRange =
    rangeFromValue !== null && rangeToValue !== null && rangeToValue >= rangeFromValue

  const canExtract =
    !busy &&
    (rangeMode === 'all' ||
      (rangeMode === 'firstN' && firstNValue !== null) ||
      (rangeMode === 'custom' && validCustomRange))

  return (
    <div className="repair-dialog-body">
      <div className="repair-current-box">
        <div className="repair-current-title">
          Текущее состояние: {count(totalCount)} записей ({count(resolvedCount)} с решениями)
        </div>
        <div className="repair-current-desc">
          Если прошлая выгрузка пропустила часть аудиозаписей из-за скролла VK или выгрузила их не
          полностью, запустите выгрузку заново или укажите файл списка. Все подтверждённые треки
          Spotify, локальные файлы, пометки и исключения перенесутся автоматически!
        </div>
      </div>

      {isExtracting ? (
        <div className="repair-extracting-box">
          <LoaderCircle className="spinning" size={28} aria-hidden="true" />
          <div className="repair-extracting-title">Выгружаем аудиозаписи из VK Музыки…</div>
          <div className="repair-extracting-desc">
            Собрано <strong>{count(vkProgress?.collected ?? 0)}</strong> записей
            {vkProgress?.expected ? ` из ${count(vkProgress.expected)}` : ''} ·{' '}
            {vkProgress?.message ?? 'Прокручиваем список…'}
          </div>
          <button type="button" className="repair-extract-cancel" onClick={onCancelVKExtraction}>
            Остановить выгрузку
          </button>
        </div>
      ) : (
        <>
          <div className="repair-status-box">
            <div className="repair-status-row">
              <div className={`repair-status-icon ${isVKConnected ? 'connected' : 'unknown'}`}>
                {isVKConnected ? (
                  <CheckCircle2 size={24} aria-hidden="true" />
                ) : (
                  <VKIcon size={24} />
                )}
              </div>
              <div className="repair-status-text">
                <div className="repair-status-title">
                  {isVKConnected
                    ? 'VK подключён: «Моя музыка» готова к сбору'
                    : vkStatus?.state === 'sign-in'
                      ? 'Требуется вход в аккаунт VK'
                      : 'Выгрузка через встроенное окно VK'}
                </div>
                <div className="repair-status-desc">
                  {isVKConnected
                    ? 'Раздел «Моя музыка» открыт. Нажмите кнопку сбора, чтобы обновить список.'
                    : vkStatus?.state === 'sign-in'
                      ? 'В открытом окне VK авторизуйтесь и перейдите в «Моя музыка».'
                      : 'Убедитесь, что в окне VK открыт раздел «Моя музыка», затем нажмите «Выгрузить из VK заново».'}
                </div>
              </div>
            </div>

            <div className="repair-range-box">
              <div className="repair-range-header">
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span>Объём выгрузки:</span>
              </div>
              <div className="repair-range-tabs">
                <button
                  type="button"
                  className={`range-tab-btn ${rangeMode === 'all' ? 'active' : ''}`}
                  onClick={() => setRangeMode('all')}
                >
                  Вся библиотека
                </button>
                <button
                  type="button"
                  className={`range-tab-btn ${rangeMode === 'firstN' ? 'active' : ''}`}
                  onClick={() => setRangeMode('firstN')}
                >
                  Первые N треков
                </button>
                <button
                  type="button"
                  className={`range-tab-btn ${rangeMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setRangeMode('custom')}
                >
                  Диапазон (с … по …)
                </button>
              </div>

              {rangeMode === 'firstN' && (
                <div className="range-controls-row">
                  <span>Выгрузить первые:</span>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    aria-label="Количество первых треков"
                    value={firstNInput}
                    onChange={(e) => setFirstNInput(e.target.value)}
                    className="range-input"
                  />
                  <span>треков</span>
                  <div className="range-presets">
                    {[50, 100, 200, 500].map((num) => (
                      <button
                        key={num}
                        type="button"
                        className={`preset-btn ${firstNValue === num ? 'selected' : ''}`}
                        onClick={() => setFirstNInput(String(num))}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rangeMode === 'custom' && (
                <div className="range-controls-row">
                  <span>С трека №:</span>
                  <input
                    type="number"
                    min={1}
                    aria-label="Начало диапазона"
                    value={rangeFromInput}
                    onChange={(e) => setRangeFromInput(e.target.value)}
                    className="range-input"
                  />
                  <span>по №:</span>
                  <input
                    type="number"
                    min={rangeFromValue ?? 1}
                    aria-label="Конец диапазона"
                    value={rangeToInput}
                    onChange={(e) => setRangeToInput(e.target.value)}
                    className="range-input"
                  />
                </div>
              )}

              <div className="range-hint">
                {rangeMode === 'all'
                  ? 'Будет прокручена вся библиотека VK до последней записи.'
                  : rangeMode === 'firstN'
                    ? firstNValue !== null
                      ? `Выгрузка остановится сразу после сбора указанного диапазона (${firstNValue} треков) — это займёт пару секунд.`
                      : 'Укажите целое число от 1 до 100 000.'
                    : validCustomRange
                      ? `Выгрузка остановится сразу после сбора указанного диапазона (${rangeToValue - rangeFromValue + 1} треков) — это займёт пару секунд.`
                      : 'Укажите корректный диапазон: начало не меньше 1 и конец не меньше начала.'}
              </div>
            </div>

            <div className="repair-vk-actions">
              <button
                type="button"
                className="primary repair-vk-extract-btn"
                disabled={!canExtract}
                onClick={() => {
                  if (rangeMode === 'all') {
                    onExtractVK()
                  } else if (rangeMode === 'firstN' && firstNValue !== null) {
                    onExtractVK({
                      limit: firstNValue,
                      rangeFrom: 1,
                      rangeTo: firstNValue,
                    })
                  } else if (rangeMode === 'custom' && validCustomRange) {
                    onExtractVK({ rangeFrom: rangeFromValue, rangeTo: rangeToValue })
                  }
                }}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {rangeMode === 'all'
                  ? 'Выгрузить всю библиотеку'
                  : rangeMode === 'firstN'
                    ? `Выгрузить первые ${firstNValue ?? '…'} треков`
                    : `Выгрузить треки ${rangeFromValue ?? '…'}–${rangeToValue ?? '…'}`}
              </button>
              <button
                type="button"
                className="repair-vk-open-btn"
                disabled={!!busy}
                onClick={onOpenVK}
                title="Показать или открыть окно VK Музыки"
              >
                <VKIcon size={16} />
                {isVKConnected ? 'Окно VK' : 'Показать окно VK'}
              </button>
            </div>
          </div>

          <div className="repair-or-divider">— или —</div>

          <div className="repair-file-box">
            <div>
              <div className="repair-file-title">Файл списка (JSON / CSV / TXT)</div>
              <div className="repair-file-desc">Импортируйте полный список из файла</div>
            </div>
            <button type="button" disabled={!!busy} onClick={onSelectFile}>
              <Upload size={15} aria-hidden="true" />
              Выбрать файл
            </button>
          </div>
        </>
      )}
    </div>
  )
}
