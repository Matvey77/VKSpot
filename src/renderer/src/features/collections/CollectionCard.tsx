import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  GripVertical,
  Music2,
  Pencil,
  Star,
  Wrench,
  X,
} from 'lucide-react'
import { summarizeCollection } from '../../../../core/library'
import type { Collection, MatchingRules } from '../../../../shared/types'
import { VKIcon } from '../../components/brand/BrandIcons'
import IconButton from '../../components/ui/IconButton'
import CollectionOptions, { type ExportFormat } from './CollectionOptions'

const count = (number: number) => number.toLocaleString('ru-RU')

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

interface CollectionCardProps {
  collection: Collection
  index: number
  totalCollections: number
  matchingRules?: MatchingRules
  busy: string
  isEditing: boolean
  editName: string
  onEditNameChange: (value: string) => void
  onStartRename: (collection: Collection) => void
  onSaveRename: (id: string) => void
  onCancelRename: () => void
  onOpen: (id: string) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  onDragStart: (event: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onDrop: (event: React.DragEvent, index: number) => void
  onRepair: (collection: Collection) => void
  onExport: (id: string, format: ExportFormat) => void
  onRequestDelete: (id: string) => void
}

export function CollectionCard({
  collection: c,
  index,
  totalCollections,
  matchingRules,
  busy,
  isEditing,
  editName,
  onEditNameChange,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
  onRepair,
  onExport,
  onRequestDelete,
}: CollectionCardProps) {
  const isPrimary = index === 0
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
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, index)}
      className={`collection-card ${isPrimary ? 'is-primary' : ''}`}
    >
      <div className="collection-reorder-col">
        <IconButton
          title="Переместить выше"
          disabled={index === 0 || !!busy}
          onClick={() => onMove(index, 'up')}
        >
          <ArrowUp size={14} aria-hidden="true" />
        </IconButton>
        <GripVertical size={16} className="grip" aria-hidden="true" />
        <IconButton
          title="Переместить ниже"
          disabled={index === totalCollections - 1 || !!busy}
          onClick={() => onMove(index, 'down')}
        >
          <ArrowDown size={14} aria-hidden="true" />
        </IconButton>
      </div>

      <div className={`collection-cover-box ${isVK ? 'vk-cover' : 'file-cover'}`} title={c.name}>
        {isVK ? <VKIcon size={34} /> : <Music2 size={34} aria-hidden="true" />}
        {isPrimary && (
          <div className="collection-cover-star" title="Основная коллекция">
            <Star size={13} fill="currentColor" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="collection-info-col">
        <div className="collection-title-row">
          {isEditing ? (
            <div className="collection-rename-row">
              <input
                type="text"
                aria-label="Название коллекции"
                className="collection-rename-input"
                value={editName}
                autoFocus
                onChange={(e) => onEditNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveRename(c.id)
                  if (e.key === 'Escape') onCancelRename()
                }}
              />
              <button
                type="button"
                className="primary collection-rename-btn"
                aria-label="Сохранить название"
                disabled={!!busy || !editName.trim()}
                onClick={() => onSaveRename(c.id)}
              >
                <Check size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="collection-rename-btn"
                aria-label="Отменить переименование"
                onClick={onCancelRename}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="collection-title-link"
                onClick={() => onOpen(c.id)}
                title="Открыть коллекцию"
              >
                {c.name}
              </button>
              <IconButton title="Переименовать коллекцию" onClick={() => onStartRename(c)}>
                <Pencil size={13} aria-hidden="true" />
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

      <div className="collection-actions-col">
        <button type="button" className="primary open-btn" onClick={() => onOpen(c.id)}>
          Открыть
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="repair-btn"
          onClick={() => onRepair(c)}
          title="Сверить исходный список без потери решений"
        >
          <Wrench size={14} aria-hidden="true" />
          Сверить список
        </button>
        <CollectionOptions
          collection={c}
          busy={!!busy}
          onExport={(format) => onExport(c.id, format)}
          onDelete={() => onRequestDelete(c.id)}
        />
      </div>
    </div>
  )
}
