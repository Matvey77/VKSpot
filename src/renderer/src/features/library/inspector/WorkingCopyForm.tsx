import { Check } from 'lucide-react'
import type { TrackRow, Working } from '../../../../../shared/types'
import { type RowDraft, useRowDraft } from '../../../state/drafts'

const FIELDS = [
  { key: 'artist', name: 'Исполнитель' },
  { key: 'title', name: 'Название' },
  { key: 'version', name: 'Версия / авторский тег' },
  { key: 'note', name: 'Заметка' },
] as const

export function WorkingCopyForm({
  row,
  busy,
  onPatch,
}: {
  row: TrackRow
  busy: boolean
  onPatch: (p: Partial<Working>) => Promise<boolean>
}) {
  const [cachedDraft, setDraft] = useRowDraft(row.id)
  const draft: RowDraft = cachedDraft ?? {
    artist: row.working.artist,
    title: row.working.title,
    version: row.working.version,
    note: row.working.note,
  }
  const modified =
    draft.artist !== row.working.artist ||
    draft.title !== row.working.title ||
    draft.version !== row.working.version ||
    draft.note !== row.working.note

  const handleFieldChange = (key: keyof RowDraft, value: string) => {
    const next: RowDraft = { ...draft, [key]: value }
    const matchesWorking =
      next.artist === row.working.artist &&
      next.title === row.working.title &&
      next.version === row.working.version &&
      next.note === row.working.note
    setDraft(matchesWorking ? undefined : next)
  }

  return (
    <div className="inspector-card">
      <h3>Рабочая копия</h3>
      <p className="inspector-section-help">
        Меняется только рабочая копия. Оригинал останется прежним.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!modified || busy) return
          const ok = await onPatch(draft)
          if (ok) setDraft(undefined)
        }}
      >
        {FIELDS.map((field) => (
          <label className="field" key={field.key}>
            {field.name}
            <input
              value={draft[field.key]}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
            />
          </label>
        ))}
        <button className="primary full-width" disabled={!modified || busy} type="submit">
          Сохранить правки
          <Check size={15} aria-hidden="true" />
        </button>
      </form>
      {modified && (
        <p className="helper-text inspector-save-hint">
          Не забудьте сохранить правки перед повторным поиском.
        </p>
      )}
    </div>
  )
}
