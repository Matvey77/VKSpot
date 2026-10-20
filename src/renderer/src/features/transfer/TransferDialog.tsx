import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, X } from 'lucide-react'

const count = (number: number) => number.toLocaleString('ru-RU')

export interface TransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  counts: {
    spotify: number
    local: number
    unresolved: number
    'local-pending': number
  }
  busy: string
  onConfirm: () => void
}

export function TransferDialog({
  open,
  onOpenChange,
  counts,
  busy,
  onConfirm,
}: TransferDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Проверка перед переносом</Dialog.Title>
          <Dialog.Description>
            Создадим новый приватный плейлист Spotify. Повторы сохраняются, исключённые записи не
            добавляются.
          </Dialog.Description>
          <div className="transfer-counts">
            <span>
              Spotify <strong>{count(counts.spotify)}</strong>
            </span>
            <span>
              Локальные <strong>{count(counts.local)}</strong>
            </span>
            <span>
              Не готово <strong>{count(counts.unresolved + counts['local-pending'])}</strong>
            </span>
          </div>
          {counts.unresolved + counts['local-pending'] > 0 && (
            <p className="inline-warning">
              Для каждой включённой записи нужно выбрать точное совпадение или локальный файл.
            </p>
          )}
          {counts.local > 0 && (
            <p className="helper-text">
              Сначала перенесём каталожные записи. Локальные добавляются через приложение Spotify;
              их позиции сохранятся в плане. Полный смешанный перенос ещё потребует сверки.
            </p>
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button>Вернуться</button>
            </Dialog.Close>
            <button
              className="primary"
              disabled={
                counts.unresolved + counts['local-pending'] > 0 || !counts.spotify || !!busy
              }
              onClick={onConfirm}
            >
              Создать плейлист
              <ArrowRight size={16} />
            </button>
          </div>
          <Dialog.Close className="dialog-close" aria-label="Закрыть">
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default TransferDialog
