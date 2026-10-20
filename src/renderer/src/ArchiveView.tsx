import {
  ArrowDownToLine,
  ArrowRight,
  Database,
  FileAudio,
  FileJson,
  ListFilter,
  ShieldCheck,
} from 'lucide-react'
import type { Collection } from '../../shared/model'

const count = (number: number) => number.toLocaleString('ru-RU')

export interface ArchiveViewProps {
  collection: Collection | undefined
  busy: string
  onExport: (format: 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan') => void
  onImportFile: () => void
}

const EXPORT_OPTIONS = [
  {
    f: 'archive',
    name: 'Полный архив VKSpot',
    text: 'JSON: исходные записи, правки, исключения и выбранные назначения. Можно восстановить в VKSpot.',
    icon: FileJson,
  },
  {
    f: 'raw-json',
    name: 'Буквальный исходный список',
    text: 'JSON: позиции, повторы, исходные названия и доступность без рабочих исправлений.',
    icon: ShieldCheck,
  },
  {
    f: 'csv',
    name: 'Таблица коллекции',
    text: 'CSV: исходные и исправленные поля рядом, включая исключённые записи.',
    icon: ListFilter,
  },
  {
    f: 'plan',
    name: 'План смешанного переноса',
    text: 'JSON: только включённые записи с выбранным назначением в исходной последовательности.',
    icon: ArrowRight,
  },
  {
    f: 'm3u8',
    name: 'Список M3U8',
    text: 'Ссылки на локальные файлы и Spotify URI. Это план, а не загрузка аудио в Spotify.',
    icon: FileAudio,
  },
] as const

export function ArchiveView({ collection, busy, onExport, onImportFile }: ArchiveViewProps) {
  return (
    <div className="content-page">
      <h1>Архив и экспорт</h1>
      <p className="page-description">
        Полный архив хранит исходный список и рабочие правки. Исключённые записи остаются в нём.
      </p>
      {collection ? (
        <>
          <div className="archive-context">
            <Database size={22} />
            <div>
              <strong>{collection.name}</strong>
              <span>
                {count(collection.rows.length)} записей ·{' '}
                {new Date(collection.importedAt).toLocaleDateString('ru-RU')}
              </span>
            </div>
          </div>
          <div className="export-list">
            {EXPORT_OPTIONS.map((item) => (
              <div className="export-option" key={item.f}>
                <item.icon size={23} />
                <div>
                  <h2>{item.name}</h2>
                  <p>{item.text}</p>
                </div>
                <button disabled={!!busy} onClick={() => onExport(item.f)}>
                  <ArrowDownToLine size={16} />
                  Сохранить
                </button>
              </div>
            ))}
          </div>
          <p className="helper-text">
            Архив содержит пути к файлам, но сами аудиофайлы в JSON не входят. Храни отдельную
            резервную копию аудио.
          </p>
        </>
      ) : (
        <div className="simple-empty">
          <Database size={32} />
          <h2>Сначала импортируй коллекцию</h2>
          <button onClick={onImportFile}>Выбрать файл</button>
        </div>
      )}
    </div>
  )
}

export default ArchiveView
