import * as Dialog from '@radix-ui/react-dialog'
import { ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatCount, formatRecordsCount, pluralize } from '../../../../shared/ru'
import type { ImportPreview } from '../../../../shared/types'

interface ImportDialogProps {
  preview: ImportPreview | null
  busy: string
  onClose: () => void
  onSave: (preview: ImportPreview, searchAfterImport: boolean) => void
}

export function ImportDialog({ preview, busy, onClose, onSave }: ImportDialogProps) {
  const [name, setName] = useState('')
  const [acceptUnverified, setAcceptUnverified] = useState(false)
  const [searchAfterImport, setSearchAfterImport] = useState(true)

  useEffect(() => {
    if (preview) {
      setName(preview.name)
      setAcceptUnverified(false)
      setSearchAfterImport(true)
    }
  }, [preview])

  const reviewVK = preview?.origin === 'VK DOM' && preview.completeness.status === 'unverified'
  const totalTracks = preview?.tracks.length ?? 0
  const previewSample = !preview
    ? []
    : totalTracks > 6
      ? [
          ...preview.tracks.slice(0, 3).map((track, index) => ({ track, position: index + 1 })),
          ...preview.tracks
            .slice(-3)
            .map((track, index) => ({ track, position: totalTracks - 2 + index })),
        ]
      : preview.tracks.map((track, index) => ({ track, position: index + 1 }))

  return (
    <Dialog.Root
      open={!!preview}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Сохранить исходный список</Dialog.Title>
          <Dialog.Description>
            Создадим отдельную коллекцию. Названия и повторы останутся как в источнике.
          </Dialog.Description>
          {preview && (
            <>
              <label className="field">
                Название коллекции
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="import-summary">
                <strong>{formatCount(totalTracks)}</strong>
                <span>
                  {pluralize(totalTracks, ['запись', 'записи', 'записей'])} из {preview.origin}
                </span>
              </div>
              <p className="inline-warning">{preview.completeness.message}</p>
              {preview.origin === 'TXT' && (
                <p className="helper-text">
                  Формат TXT: по одной записи на строку — «Исполнитель - Название».
                </p>
              )}
              <p className="helper-text">
                {totalTracks > 6 ? 'Первые три и последние три записи:' : 'Записи списка:'}
              </p>
              <div className="preview-tracks">
                {previewSample.map(({ track, position }) => (
                  <div key={position}>
                    <span>{position}</span>
                    <strong>{track.artist || 'Без исполнителя'}</strong>
                    <span>{track.title || 'Без названия'}</span>
                  </div>
                ))}
              </div>
              {reviewVK && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={acceptUnverified}
                    onChange={(event) => setAcceptUnverified(event.target.checked)}
                  />
                  Сохранить как непроверенный список. Он может содержать пропуски.
                </label>
              )}
              {!preview.restored && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={searchAfterImport}
                    onChange={(event) => setSearchAfterImport(event.target.checked)}
                  />
                  Начать поиск после сохранения
                </label>
              )}
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <button disabled={!!busy}>Отмена</button>
                </Dialog.Close>
                <button
                  className="primary"
                  disabled={
                    !!busy || !totalTracks || !name.trim() || (!!reviewVK && !acceptUnverified)
                  }
                  onClick={() => onSave({ ...preview, name }, searchAfterImport)}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  {reviewVK
                    ? 'Сохранить непроверенный список'
                    : `Сохранить ${formatRecordsCount(totalTracks)}`}
                </button>
              </div>
            </>
          )}
          <Dialog.Close className="dialog-close" aria-label="Закрыть" disabled={!!busy}>
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default ImportDialog
