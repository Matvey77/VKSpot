import * as Dialog from '@radix-ui/react-dialog'
import { LoaderCircle, Music2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import type { Collection, MatchingRules } from '../../../../shared/types'
import { VKIcon } from '../../components/brand/BrandIcons'
import { CollectionCard } from './CollectionCard'
import type { ExportFormat } from './CollectionOptions'

const count = (number: number) => number.toLocaleString('ru-RU')

function formatCollectionsCount(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} коллекция`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} коллекции`
  return `${n} коллекций`
}

interface CollectionsOverviewProps {
  collections: Collection[]
  matchingRules?: MatchingRules
  onOpenCollection: (id: string) => void
  onRenameCollection: (id: string, newName: string) => Promise<boolean>
  onDeleteCollection: (id: string) => Promise<void>
  onReorderCollections: (ids: string[]) => Promise<void>
  onImportFile: () => void
  onExtractVK?: () => void
  onOpenVK: () => void
  onOpenRepair: (collection: Collection) => void
  onExportCollection: (id: string, format: ExportFormat) => void
  busy: string
}

export function CollectionsOverview({
  collections,
  matchingRules,
  onOpenCollection,
  onRenameCollection,
  onDeleteCollection,
  onReorderCollections,
  onImportFile,
  onExtractVK,
  onOpenVK,
  onOpenRepair,
  onExportCollection,
  busy,
}: CollectionsOverviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)

  const handleStartRename = (c: Collection) => {
    setEditingId(c.id)
    setEditName(c.name)
  }

  const handleSaveRename = async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    const ok = await onRenameCollection(id, trimmed)
    if (ok) setEditingId(null)
  }

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= collections.length) return
    const reordered = [...collections]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return
    reordered.splice(targetIndex, 0, moved)
    await onReorderCollections(reordered.map((c) => c.id))
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index)
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === dropIndex) {
      setDraggedIdx(null)
      return
    }
    const reordered = [...collections]
    const [moved] = reordered.splice(draggedIdx, 1)
    setDraggedIdx(null)
    if (!moved) return
    reordered.splice(dropIndex, 0, moved)
    await onReorderCollections(reordered.map((c) => c.id))
  }

  const targetDeleteCollection = collections.find((c) => c.id === confirmDeleteId)

  return (
    <div className="collections-overview-container">
      <header className="collections-header">
        <div>
          <h1 className="collections-header-title">
            <Music2 size={28} className="brand-accent-icon" aria-hidden="true" />
            Коллекции
          </h1>
          <p className="collections-header-subtitle">
            {collections.length
              ? `${formatCollectionsCount(collections.length)} · Основная коллекция используется по умолчанию`
              : 'Управляйте вашей музыкой, настраивайте соответствия со Spotify и организуйте плейлисты.'}
          </p>
        </div>
        <div className="collections-header-actions">
          <button type="button" onClick={onImportFile} disabled={!!busy}>
            <Upload size={15} aria-hidden="true" />
            Импорт списка
          </button>
          <button
            type="button"
            className="primary"
            onClick={onExtractVK || onOpenVK}
            disabled={!!busy}
          >
            {busy === 'extract' ? (
              <>
                <LoaderCircle className="spinning" size={15} aria-hidden="true" />
                Выгрузка из VK…
              </>
            ) : (
              <>
                <VKIcon size={16} />
                Выгрузить из VK
              </>
            )}
          </button>
        </div>
      </header>

      {!collections.length ? (
        <section className="empty-library collections-empty">
          <div className="collections-empty-inner">
            <div className="collections-empty-icon">
              <Music2 size={36} aria-hidden="true" />
            </div>
            <h2>Нет сохранённых коллекций</h2>
            <p>
              Выгрузите аудиозаписи из вашей VK Музыки или импортируйте готовый файл (JSON, CSV,
              TXT). Вся музыка будет сохранена локально без потери данных.
            </p>
            <div className="collections-empty-actions">
              <button type="button" className="primary" onClick={onOpenVK} disabled={!!busy}>
                <VKIcon size={16} />
                Выгрузить из VK
              </button>
              <button type="button" onClick={onImportFile} disabled={!!busy}>
                <Upload size={15} aria-hidden="true" />
                Импортировать файл
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="collections-list">
          {collections.map((c, index) => (
            <CollectionCard
              key={c.id}
              collection={c}
              index={index}
              totalCollections={collections.length}
              matchingRules={matchingRules}
              busy={busy}
              isEditing={editingId === c.id}
              editName={editName}
              onEditNameChange={setEditName}
              onStartRename={handleStartRename}
              onSaveRename={(id) => void handleSaveRename(id)}
              onCancelRename={() => setEditingId(null)}
              onOpen={onOpenCollection}
              onMove={(idx, dir) => void handleMove(idx, dir)}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedIdx(null)}
              onDrop={(e, dropIndex) => void handleDrop(e, dropIndex)}
              onRepair={onOpenRepair}
              onExport={onExportCollection}
              onRequestDelete={setConfirmDeleteId}
            />
          ))}
        </div>
      )}

      <Dialog.Root
        open={!!confirmDeleteId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Удалить коллекцию?</Dialog.Title>
            <Dialog.Description>
              Вы собираетесь удалить коллекцию «{targetDeleteCollection?.name}» (
              {count(targetDeleteCollection?.rows.length ?? 0)} записей). Это действие нельзя будет
              отменить.
            </Dialog.Description>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirmDeleteId(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="primary danger-button"
                onClick={async () => {
                  if (confirmDeleteId) {
                    await onDeleteCollection(confirmDeleteId)
                    setConfirmDeleteId(null)
                  }
                }}
              >
                Удалить навсегда
              </button>
            </div>
            <Dialog.Close asChild>
              <button className="dialog-close" aria-label="Закрыть">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

export default CollectionsOverview
