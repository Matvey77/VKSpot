import { Check } from 'lucide-react'
import { useState } from 'react'
import { formatCount, formatRecordsGenitive } from '../../../../shared/ru'
import type { Collection, ImportPreview } from '../../../../shared/types'

interface RepairPreviewConfirmProps {
  collection: Collection
  preview: ImportPreview
  resolvedCount: number
  busy: string
  onClose: () => void
  onConfirmRepair: (collectionId: string, preview: ImportPreview) => void
}

export function RepairPreviewConfirm({
  collection,
  preview,
  resolvedCount,
  busy,
  onClose,
  onConfirmRepair,
}: RepairPreviewConfirmProps) {
  const [accept, setAccept] = useState(false)

  return (
    <div className="repair-preview-body">
      <div className="repair-preview-card">
        <div className="repair-preview-heading">
          <Check size={16} aria-hidden="true" />
          Сравнение списков:
        </div>
        <div className="repair-preview-grid">
          <div>
            В коллекции сейчас: <strong>{formatCount(collection.rows.length)}</strong>
          </div>
          <div>
            {preview.range ? (
              <>
                Обновляемый диапазон:{' '}
                <strong>
                  с {preview.range.from} по {preview.range.to} ({formatCount(preview.tracks.length)}
                  )
                </strong>
              </>
            ) : (
              <>
                В новом списке: <strong>{formatCount(preview.tracks.length)}</strong>
              </>
            )}
          </div>
          <div>
            Будет сохранено решений: <strong>~{formatCount(resolvedCount)}</strong>
          </div>
          <div>
            {preview.range ? (
              <>
                Остаётся без изменений:{' '}
                <strong>
                  {formatCount(Math.max(0, collection.rows.length - preview.tracks.length))}
                </strong>
              </>
            ) : (
              <>
                Новых записей:{' '}
                <strong className="repair-new-tracks-count">
                  +{formatCount(Math.max(0, preview.tracks.length - collection.rows.length))}
                </strong>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="repair-preview-note">
        <Check size={15} aria-hidden="true" />
        <span>
          Все подтверждённые совпадения Spotify, привязанные файлы и исключения останутся в силе.
          Новые записи из VK добавятся со статусом «Нужен выбор».
        </span>
      </div>

      <label className="check-field repair-confirm-check">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        <span>
          Подтверждаю синхронизацию коллекции «{collection.name}» с новым списком из{' '}
          {formatRecordsGenitive(preview.tracks.length)}
        </span>
      </label>

      <div className="dialog-actions repair-dialog-actions">
        <button type="button" disabled={!!busy} onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className="primary"
          disabled={!accept || !!busy}
          onClick={() => onConfirmRepair(collection.id, preview)}
        >
          <Check size={16} aria-hidden="true" />
          {busy ? 'Синхронизация…' : 'Применить обновление'}
        </button>
      </div>
    </div>
  )
}
