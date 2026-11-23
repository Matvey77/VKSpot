import { ArrowRight, Check, FolderOpen, Upload } from 'lucide-react'
import { SpotifyIcon, VKIcon } from '../../components/brand/BrandIcons'

export function LibraryEmptyState({
  busy,
  onImportFile,
  onOpenVK,
}: {
  busy: boolean
  onImportFile: () => void
  onOpenVK: () => void
}) {
  return (
    <section className="empty-library">
      <div className="empty-path">
        <span className="source-icon">
          <VKIcon size={48} />
        </span>
        <span className="path-line" />
        <FolderOpen size={36} aria-hidden="true" />
        <span className="path-line" />
        <span className="destination-icon">
          <SpotifyIcon size={44} />
        </span>
      </div>
      <h2>Начни с полного списка</h2>
      <p>
        Импортируй JSON, CSV или TXT — либо открой свою музыку в VK. Повторы и недоступные записи
        останутся в архиве.
      </p>
      <div className="empty-actions">
        <button className="primary" onClick={onImportFile} disabled={busy}>
          <Upload size={17} aria-hidden="true" />
          Выбрать файл
        </button>
        <button onClick={onOpenVK}>
          Выгрузить из VK
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="empty-footnotes">
        <span>
          <Check size={15} aria-hidden="true" />
          Исходные названия сохраняются
        </span>
        <span>
          <Check size={15} aria-hidden="true" />
          Правки можно отменить
        </span>
        <span>
          <Check size={15} aria-hidden="true" />
          Всё хранится локально
        </span>
      </div>
    </section>
  )
}
