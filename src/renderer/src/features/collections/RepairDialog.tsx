import * as Dialog from '@radix-ui/react-dialog'
import { Wrench, X } from 'lucide-react'
import type {
  Collection,
  ImportPreview,
  VKExportProgress,
  VKStatus,
} from '../../../../shared/types'
import { RepairPreviewConfirm } from './RepairPreviewConfirm'
import { RepairSourcePicker } from './RepairSourcePicker'

interface RepairDialogProps {
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

function RepairDialogContent({
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
}: Omit<RepairDialogProps, 'collection'> & { collection: Collection }) {
  const resolvedCount = collection.rows.filter(
    (r) =>
      r.working.destination !== 'unresolved' ||
      r.working.localPending ||
      Boolean(r.working.note) ||
      r.working.excluded,
  ).length

  return (
    <Dialog.Content className="dialog repair-dialog">
      <Dialog.Title className="repair-dialog-title">
        <Wrench size={22} className="brand-accent-icon" aria-hidden="true" />
        Сверить и обновить список
      </Dialog.Title>
      <Dialog.Description>
        Обновим исходный список из VK для «{collection.name}» с сохранением всех твоих решений.
      </Dialog.Description>

      {!preview ? (
        <RepairSourcePicker
          totalCount={collection.rows.length}
          resolvedCount={resolvedCount}
          busy={busy}
          vkStatus={vkStatus}
          vkProgress={vkProgress}
          onSelectFile={onSelectFile}
          onOpenVK={onOpenVK}
          onExtractVK={onExtractVK}
          onCancelVKExtraction={onCancelVKExtraction}
        />
      ) : (
        <RepairPreviewConfirm
          key={`${collection.id}:${preview.tracks.length}:${preview.origin}:${preview.range?.from ?? ''}-${preview.range?.to ?? ''}`}
          collection={collection}
          preview={preview}
          resolvedCount={resolvedCount}
          busy={busy}
          onClose={onClose}
          onConfirmRepair={onConfirmRepair}
        />
      )}

      <Dialog.Close asChild>
        <button className="dialog-close" aria-label="Закрыть" disabled={!!busy}>
          <X size={16} aria-hidden="true" />
        </button>
      </Dialog.Close>
    </Dialog.Content>
  )
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
  if (!collection) return null

  return (
    <Dialog.Root
      open={!!collection}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <RepairDialogContent
          key={collection.id}
          collection={collection}
          preview={preview}
          busy={busy}
          vkStatus={vkStatus}
          vkProgress={vkProgress}
          onClose={onClose}
          onSelectFile={onSelectFile}
          onOpenVK={onOpenVK}
          onExtractVK={onExtractVK}
          onCancelVKExtraction={onCancelVKExtraction}
          onConfirmRepair={onConfirmRepair}
        />
      </Dialog.Portal>
    </Dialog.Root>
  )
}
