import { useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Download,
  GripVertical,
  LoaderCircle,
  Music2,
  Pencil,
  Star,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Collection, MatchingRules } from '../../../../shared/model'
import { summarizeCollection } from '../../../../core/library'
import IconButton from '../../components/ui/IconButton'
import { VKIcon } from '../../components/brand/BrandIcons'

const count = (number: number) => number.toLocaleString('ru-RU')

function formatCollectionsCount(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} коллекция`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} коллекции`
  return `${n} коллекций`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export interface CollectionsOverviewProps {
  collections: Collection[]
  matchingRules?: MatchingRules
  onOpenCollection: (id: string) => void
  onRenameCollection: (id: string, newName: string) => Promise<void>
  onDeleteCollection: (id: string) => Promise<void>
  onReorderCollections: (ids: string[]) => Promise<void>
  onImportFile: () => void
  onExtractVK?: () => void
  onOpenVK: () => void
  onOpenRepair: (collection: Collection) => void
  onExportCollection: (id: string) => void
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
    if (!editName.trim()) return
    await onRenameCollection(id, editName.trim())
    setEditingId(null)
  }

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= collections.length) return
    const reordered = [...collections]
    const [moved] = reordered.splice(index, 1)
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
    if (draggedIdx === null || draggedIdx === dropIndex) return
    const reordered = [...collections]
    const [moved] = reordered.splice(draggedIdx, 1)
    reordered.splice(dropIndex, 0, moved)
    setDraggedIdx(null)
    await onReorderCollections(reordered.map((c) => c.id))
  }

  const targetDeleteCollection = collections.find((c) => c.id === confirmDeleteId)

  return (
    <div className="collections-overview-container">
      <header className="collections-header">
        <div>
          <h1 className="collections-header-title">
            <Music2 size={28} className="brand-accent-icon" />
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
            <Upload size={15} />
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
                <LoaderCircle className="spinning" size={15} />
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
        <section
          className="empty-library"
          style={{
            background: 'var(--surface)',
            border: '1.5px dashed var(--line)',
            borderRadius: '16px',
            padding: '56px 32px',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--selected)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Music2 size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>
              Нет сохранённых коллекций
            </h2>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '14px',
                lineHeight: '1.6',
                margin: '0 0 24px',
              }}
            >
              Выгрузите аудиозаписи из вашей VK Музыки или импортируйте готовый файл (JSON, CSV,
              TXT). Вся музыка будет сохранена локально без потери данных.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button type="button" className="primary" onClick={onOpenVK} disabled={!!busy}>
                <VKIcon size={16} />
                Выгрузить из VK
              </button>
              <button type="button" onClick={onImportFile} disabled={!!busy}>
                <Upload size={15} />
                Импортировать файл
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="collections-list">
          {collections.map((c, index) => {
            const isPrimary = index === 0
            const isEditing = editingId === c.id

            // Breakdown stats
            const total = c.rows.length
            const summary = summarizeCollection(c, matchingRules)
            const resolved = total - summary.unresolved
            const spotifyCount = summary.destinations.spotify
            const reviewVersions = summary.groups.review
            const localPending = summary.localPending

            const spotifyPct = total > 0 ? (spotifyCount / total) * 100 : 0
            const reviewPct = total > 0 ? (reviewVersions / total) * 100 : 0
            const localPct = total > 0 ? (localPending / total) * 100 : 0

            const isVK = c.origin.toLowerCase().includes('vk')

            return (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => void handleDrop(e, index)}
                className={`collection-card ${isPrimary ? 'is-primary' : ''}`}
              >
                {/* Reorder controls */}
                <div className="collection-reorder-col">
                  <IconButton
                    title="Переместить выше"
                    disabled={index === 0 || !!busy}
                    onClick={() => void handleMove(index, 'up')}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <GripVertical size={16} className="grip" />
                  <IconButton
                    title="Переместить ниже"
                    disabled={index === collections.length - 1 || !!busy}
                    onClick={() => void handleMove(index, 'down')}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                </div>

                {/* Album / Playlist Cover Badge */}
                <div
                  className={`collection-cover-box ${isVK ? 'vk-cover' : 'file-cover'}`}
                  title={c.name}
                >
                  {isVK ? <VKIcon size={34} /> : <Music2 size={34} />}
                  {isPrimary && (
                    <div className="collection-cover-star" title="Основная коллекция">
                      <Star size={13} fill="currentColor" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="collection-info-col">
                  <div className="collection-title-row">
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveRename(c.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          style={{
                            fontSize: '16px',
                            fontWeight: 650,
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1.5px solid var(--accent)',
                            background: 'var(--control)',
                            color: 'var(--ink)',
                          }}
                        />
                        <button
                          type="button"
                          className="primary"
                          style={{ height: '30px', padding: '0 8px' }}
                          onClick={() => void handleSaveRename(c.id)}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          style={{ height: '30px', padding: '0 8px' }}
                          onClick={() => setEditingId(null)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="collection-title-link"
                          onClick={() => onOpenCollection(c.id)}
                          title="Открыть коллекцию"
                        >
                          {c.name}
                        </button>
                        <IconButton
                          title="Переименовать коллекцию"
                          onClick={() => handleStartRename(c)}
                        >
                          <Pencil size={13} />
                        </IconButton>
                      </>
                    )}
                  </div>

                  <div className="collection-meta-line">
                    <span>
                      <strong>{count(total)}</strong> записей
                    </span>
                    <span className="dot">•</span>
                    <span>Импортировано {formatDate(c.importedAt)}</span>
                  </div>

                  {/* Multi-segment matching progress */}
                  <div className="collection-progress-wrap">
                    <div className="collection-segmented-bar">
                      <div
                        className="segmented-part spotify"
                        style={{ width: `${spotifyPct}%` }}
                        title={`Выбрано Spotify: ${count(spotifyCount)} (${Math.round(spotifyPct)}%)`}
                      />
                      <div
                        className="segmented-part local"
                        style={{ width: `${localPct}%` }}
                        title={`Нужен локальный файл: ${count(localPending)} (${Math.round(localPct)}%)`}
                      />
                      <div
                        className="segmented-part review"
                        style={{ width: `${reviewPct}%` }}
                        title={`Требует проверки: ${count(reviewVersions)} (${Math.round(reviewPct)}%)`}
                      />
                    </div>

                    <div className="collection-progress-legend">
                      {spotifyCount > 0 && (
                        <span className="legend-item">
                          <span className="legend-dot spotify" />
                          {count(spotifyCount)} выбрано в Spotify
                        </span>
                      )}
                      {reviewVersions > 0 && (
                        <span className="legend-item">
                          <span className="legend-dot review" />
                          {count(reviewVersions)} проверить
                        </span>
                      )}
                      <span className="legend-item">
                        <span className="legend-dot resolved" />
                        {count(resolved)} решено
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="collection-actions-col">
                  <button
                    type="button"
                    className="primary open-btn"
                    onClick={() => onOpenCollection(c.id)}
                  >
                    Открыть
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    className="repair-btn"
                    onClick={() => onOpenRepair(c)}
                    title="Починить / синхронизировать список из VK без потери решений"
                  >
                    <Wrench size={14} />
                    Починить
                  </button>
                  <IconButton
                    title="Экспорт архива коллекции"
                    onClick={() => onExportCollection(c.id)}
                  >
                    <Download size={16} />
                  </IconButton>
                  <IconButton
                    title="Удалить коллекцию"
                    onClick={() => setConfirmDeleteId(c.id)}
                    className="danger-hover"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
                className="primary"
                style={{ background: 'var(--error-ink)', borderColor: 'var(--error-ink)' }}
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
                <X size={16} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
