import * as Dialog from '@radix-ui/react-dialog'
import {
  Download,
  FileAudio,
  FileJson,
  FileSpreadsheet,
  ListOrdered,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import type { Collection } from '../../../../shared/model'

export type ExportFormat = 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan'

const formats = [
  {
    value: 'archive',
    name: 'Сохранить резервную копию',
    detail: 'JSON VKSpot · оригинал, правки и решения. Можно восстановить в приложении.',
    icon: ShieldCheck,
  },
  {
    value: 'raw-json',
    name: 'Исходный список VK',
    detail: 'JSON · исходные названия, порядок и повторы без рабочих правок.',
    icon: FileJson,
  },
  {
    value: 'csv',
    name: 'Таблица CSV',
    detail: 'Исходные и исправленные поля рядом, включая исключённые записи.',
    icon: FileSpreadsheet,
  },
  {
    value: 'plan',
    name: 'План переноса',
    detail: 'JSON · выбранные назначения в исходном порядке, без исключённых записей.',
    icon: ListOrdered,
  },
  {
    value: 'm3u8',
    name: 'Плейлист M3U8',
    detail: 'Пути к локальным файлам и ссылки Spotify. Аудио в файл не входит.',
    icon: FileAudio,
  },
] as const

export default function CollectionOptions({
  collection,
  busy,
  onExport,
  onDelete,
}: {
  collection: Collection
  busy: boolean
  onExport: (format: ExportFormat) => void
  onDelete: () => void
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="collection-options-trigger"
          aria-label={`Параметры коллекции «${collection.name}»`}
          title="Параметры коллекции"
        >
          <MoreHorizontal size={20} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog collection-options-dialog">
          <Dialog.Title>Параметры коллекции</Dialog.Title>
          <Dialog.Description>
            Экспорт и резервная копия для «{collection.name}».
          </Dialog.Description>
          <div className="collection-options-context">
            <strong>{collection.name}</strong>
            <span>
              {collection.rows.length.toLocaleString('ru-RU')} записей · исходный порядок сохранён
            </span>
          </div>
          <h3>Сохранить на компьютер</h3>
          <div className="collection-export-options">
            {formats.map((format) => (
              <Dialog.Close asChild key={format.value}>
                <button type="button" disabled={busy} onClick={() => onExport(format.value)}>
                  <format.icon size={20} />
                  <span>
                    <strong>{format.name}</strong>
                    <small>{format.detail}</small>
                  </span>
                  <Download size={16} />
                </button>
              </Dialog.Close>
            ))}
          </div>
          <p className="helper-text">
            Резервная копия хранит описания и пути к файлам. Сами аудиофайлы сохраняй отдельно.
          </p>
          <div className="collection-options-danger">
            <span>Удаление коллекции нельзя отменить.</span>
            <Dialog.Close asChild>
              <button type="button" disabled={busy} onClick={onDelete}>
                <Trash2 size={15} />
                Удалить коллекцию
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="dialog-close" aria-label="Закрыть параметры коллекции">
              <X size={18} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
