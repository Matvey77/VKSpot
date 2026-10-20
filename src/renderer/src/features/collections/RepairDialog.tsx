import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Check,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Upload,
  Wrench,
  X,
} from 'lucide-react'
import type {
  Collection,
  ImportPreview,
  VKExportProgress,
  VKStatus,
} from '../../../../shared/model'
import { VKIcon } from '../../components/brand/BrandIcons'

const count = (number: number) => number.toLocaleString('ru-RU')

export interface RepairDialogProps {
  collection: Collection | null
  preview: ImportPreview | null
  busy: string
  vkStatus?: VKStatus
  vkProgress: VKExportProgress | null
  onClose: () => void
  onSelectFile: () => void
  onOpenVK: () => void
  onExtractVK: (options?: { rangeFrom?: number; rangeTo?: number; limit?: number }) => void
  onCancelVKExtraction: () => void
  onConfirmRepair: (collectionId: string, preview: ImportPreview) => void
}

export function RepairDialog({
  collection,
  preview,
  busy,
  vkStatus,
  vkProgress,
  onClose,
  onSelectFile,
  onOpenVK,
  onExtractVK,
  onCancelVKExtraction,
  onConfirmRepair,
}: RepairDialogProps) {
  const [accept, setAccept] = useState(false)
  const [rangeMode, setRangeMode] = useState<'all' | 'firstN' | 'custom'>('all')
  const [firstNCount, setFirstNCount] = useState<number>(100)
  const [rangeFrom, setRangeFrom] = useState<number>(1)
  const [rangeTo, setRangeTo] = useState<number>(100)

  if (!collection) return null

  const resolvedCount = collection.rows.filter(
    (r) =>
      r.working.destination !== 'unresolved' ||
      r.working.localPending ||
      Boolean(r.working.note) ||
      r.working.excluded,
  ).length

  const isVKConnected = vkStatus?.state === 'connected'
  const isExtracting = busy === 'extract'

  return (
    <Dialog.Root
      open={!!collection}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog repair-dialog">
          <Dialog.Title style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wrench size={22} className="brand-accent-icon" />
            Починить и синхронизировать коллекцию
          </Dialog.Title>
          <Dialog.Description>
            Обновим список треков из VK для «{collection.name}» с гарантированным сохранением всех
            ваших решений.
          </Dialog.Description>

          {!preview ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                margin: '18px 0 10px',
              }}
            >
              {/* Current Status Box */}
              <div
                style={{
                  background: 'var(--canvas)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: '4px' }}>
                  Текущее состояние: {count(collection.rows.length)} записей ({count(resolvedCount)}{' '}
                  с решениями)
                </div>
                <div style={{ color: 'var(--muted)' }}>
                  Если прошлая выгрузка пропустила часть аудиозаписей из-за скролла VK или выгрузила
                  их не полностью, запустите выгрузку заново или укажите файл списка. Все
                  подтверждённые треки Spotify, локальные файлы, пометки и исключения перенесутся
                  автоматически!
                </div>
              </div>

              {/* Extraction in progress */}
              {isExtracting ? (
                <div className="repair-extracting-box">
                  <LoaderCircle className="spinning" size={28} />
                  <div className="repair-extracting-title">Выгружаем аудиозаписи из VK Музыки…</div>
                  <div className="repair-extracting-desc">
                    Собрано <strong>{count(vkProgress?.collected ?? 0)}</strong> записей
                    {vkProgress?.expected ? ` из ${count(vkProgress.expected)}` : ''} ·{' '}
                    {vkProgress?.message ?? 'Прокручиваем список…'}
                  </div>
                  <button type="button" onClick={onCancelVKExtraction} style={{ marginTop: '6px' }}>
                    Остановить выгрузку
                  </button>
                </div>
              ) : (
                <>
                  {/* Option 1: Direct from VK */}
                  <div className="repair-status-box">
                    <div className="repair-status-row">
                      <div
                        className={`repair-status-icon ${isVKConnected ? 'connected' : 'unknown'}`}
                      >
                        {isVKConnected ? <CheckCircle2 size={24} /> : <VKIcon size={24} />}
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

                    {/* Range settings box */}
                    <div className="repair-range-box">
                      <div className="repair-range-header">
                        <SlidersHorizontal size={14} />
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
                            value={firstNCount}
                            onChange={(e) =>
                              setFirstNCount(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="range-input"
                          />
                          <span>треков</span>
                          <div className="range-presets">
                            {[50, 100, 200, 500].map((num) => (
                              <button
                                key={num}
                                type="button"
                                className={`preset-btn ${firstNCount === num ? 'selected' : ''}`}
                                onClick={() => setFirstNCount(num)}
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
                            value={rangeFrom}
                            onChange={(e) => setRangeFrom(Math.max(1, Number(e.target.value) || 1))}
                            className="range-input"
                          />
                          <span>по №:</span>
                          <input
                            type="number"
                            min={rangeFrom}
                            value={rangeTo}
                            onChange={(e) =>
                              setRangeTo(Math.max(rangeFrom, Number(e.target.value) || rangeFrom))
                            }
                            className="range-input"
                          />
                        </div>
                      )}

                      <div className="range-hint">
                        {rangeMode === 'all'
                          ? 'Будет прокручена вся библиотека VK до последней записи.'
                          : `Выгрузка остановится сразу после сбора указанного диапазона (${
                              rangeMode === 'firstN' ? firstNCount : rangeTo - rangeFrom + 1
                            } треков) — это займёт пару секунд.`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="primary"
                        style={{ height: '42px', flex: 1, justifyContent: 'center' }}
                        disabled={!!busy}
                        onClick={() => {
                          if (rangeMode === 'all') {
                            onExtractVK()
                          } else if (rangeMode === 'firstN') {
                            onExtractVK({
                              limit: firstNCount,
                              rangeFrom: 1,
                              rangeTo: firstNCount,
                            })
                          } else {
                            onExtractVK({ rangeFrom, rangeTo })
                          }
                        }}
                      >
                        <RefreshCw size={15} />
                        {rangeMode === 'all'
                          ? 'Выгрузить всю библиотеку'
                          : rangeMode === 'firstN'
                            ? `Выгрузить первые ${firstNCount} треков`
                            : `Выгрузить треки ${rangeFrom}–${rangeTo}`}
                      </button>
                      <button
                        type="button"
                        style={{ height: '42px', justifyContent: 'center' }}
                        disabled={!!busy}
                        onClick={onOpenVK}
                        title="Показать или открыть окно VK Музыки"
                      >
                        <VKIcon size={16} />
                        {isVKConnected ? 'Окно VK' : 'Показать окно VK'}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'center',
                      color: 'var(--muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    — или —
                  </div>

                  {/* Option 2: From file */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650, fontSize: '13px', color: 'var(--ink)' }}>
                        Файл списка (JSON / CSV / TXT)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                        Импортируйте полный список из файла
                      </div>
                    </div>
                    <button type="button" disabled={!!busy} onClick={onSelectFile}>
                      <Upload size={15} />
                      Выбрать файл
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                margin: '18px 0 10px',
              }}
            >
              {/* Preview Comparison Card */}
              <div
                style={{
                  background: 'var(--selected)',
                  border: '1px solid var(--accent)',
                  borderRadius: '10px',
                  padding: '16px 18px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: 'var(--accent)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Check size={16} />
                  Сравнение списков:
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    color: 'var(--ink)',
                  }}
                >
                  <div>
                    В коллекции сейчас: <strong>{count(collection.rows.length)}</strong>
                  </div>
                  <div>
                    {preview.range ? (
                      <>
                        Обновляемый диапазон:{' '}
                        <strong>
                          с {preview.range.from} по {preview.range.to} (
                          {count(preview.tracks.length)})
                        </strong>
                      </>
                    ) : (
                      <>
                        В новом списке: <strong>{count(preview.tracks.length)}</strong>
                      </>
                    )}
                  </div>
                  <div>
                    Будет сохранено решений: <strong>~{count(resolvedCount)}</strong>
                  </div>
                  <div>
                    {preview.range ? (
                      <>
                        Остаётся без изменений:{' '}
                        <strong>
                          {count(Math.max(0, collection.rows.length - preview.tracks.length))}
                        </strong>
                      </>
                    ) : (
                      <>
                        Новых треков:{' '}
                        <strong style={{ color: '#0f7b32' }}>
                          +{count(Math.max(0, preview.tracks.length - collection.rows.length))}
                        </strong>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--canvas)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  color: 'var(--muted)',
                  lineHeight: '1.4',
                }}
              >
                ✓ Все подтверждённые совпадения Spotify, привязанные файлы и исключения останутся в
                силе. Новые найденные треки добавятся со статусом «Нужен выбор».
              </div>

              <label
                className="checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  marginTop: '4px',
                }}
              >
                <input
                  type="checkbox"
                  checked={accept}
                  onChange={(e) => setAccept(e.target.checked)}
                />
                <span>
                  Подтверждаю синхронизацию коллекции «{collection.name}» с новым списком из{' '}
                  {count(preview.tracks.length)} треков
                </span>
              </label>

              <div className="dialog-actions" style={{ marginTop: '8px' }}>
                <button type="button" disabled={!!busy} onClick={onClose}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!accept || !!busy}
                  onClick={() => onConfirmRepair(collection.id, preview)}
                >
                  <Check size={16} />
                  {busy ? 'Синхронизация…' : 'Применить обновление'}
                </button>
              </div>
            </div>
          )}

          <Dialog.Close asChild>
            <button className="dialog-close" aria-label="Закрыть" disabled={!!busy}>
              <X size={16} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
