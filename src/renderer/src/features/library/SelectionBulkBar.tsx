import { Ban, CheckCheck, Clock, FileAudio, ListPlus, RefreshCw, RotateCcw, X } from 'lucide-react'
import type { Working } from '../../../../shared/types'
import ExplainedButton from '../../components/ui/ExplainedButton'
import IconButton from '../../components/ui/IconButton'

const count = (number: number) => number.toLocaleString('ru-RU')

export function SelectionBulkBar({
  selectedCount,
  hiddenSelected,
  selectedMatches,
  busy,
  canRepeatSearch,
  onConfirmSelection,
  onPatchSelected,
  onRepeatSearch,
  onKeepVisibleOnly,
  onClearSelection,
}: {
  selectedCount: number
  hiddenSelected: number
  selectedMatches: number
  busy: boolean
  canRepeatSearch: boolean
  onConfirmSelection: () => void
  onPatchSelected: (value: Partial<Working>) => void
  onRepeatSearch: () => void
  onKeepVisibleOnly: () => void
  onClearSelection: () => void
}) {
  return (
    <div className="selection-bar">
      <span>
        Выбрано {count(selectedCount)}
        {hiddenSelected > 0 && <> · вне выборки {count(hiddenSelected)}</>}
      </span>
      <ExplainedButton
        className="primary"
        hintLabel="Почему нельзя подтвердить выбранные совпадения"
        hint="Подтверждаешь только выделенные записи. Название, исполнители и длительность совпадают; это сверка описаний, а не аудио. Группу можно отменить."
        reason={
          busy
            ? 'Дождись завершения текущего действия.'
            : selectedMatches !== selectedCount
              ? 'Для массового подтверждения выбери записи без решения со статусом «Совпадают данные». Используй кнопку «Выделить совпадения».'
              : undefined
        }
        onClick={onConfirmSelection}
      >
        <CheckCheck size={14} aria-hidden="true" />
        Подтвердить выбранные ({count(selectedMatches)})
      </ExplainedButton>
      <div className="selection-decisions" role="group" aria-label="Решения для выбранных записей">
        <button
          disabled={busy}
          title="Сбросить решение и вернуть выбранные записи в статус «Нужен выбор»"
          onClick={() =>
            onPatchSelected({
              destination: 'unresolved',
              spotify: null,
              localPending: false,
              reviewDeferred: false,
              local: null,
              excluded: false,
            })
          }
        >
          <RotateCcw size={14} aria-hidden="true" />
          Сбросить решение
        </button>
        <button disabled={busy} onClick={() => onPatchSelected({ excluded: true })}>
          <Ban size={14} aria-hidden="true" />
          Исключить
        </button>
        <button disabled={busy} onClick={() => onPatchSelected({ excluded: false })}>
          <ListPlus size={14} aria-hidden="true" />
          Вернуть в перенос
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onPatchSelected({
              destination: 'unresolved',
              localPending: false,
              reviewDeferred: true,
            })
          }
        >
          <Clock size={14} aria-hidden="true" />
          Разобрать позже
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onPatchSelected({
              destination: 'unresolved',
              localPending: true,
              reviewDeferred: false,
            })
          }
        >
          <FileAudio size={14} aria-hidden="true" />
          Нужен локальный файл
        </button>
        <button disabled={busy || !canRepeatSearch} onClick={onRepeatSearch}>
          <RefreshCw size={14} aria-hidden="true" />
          Повторить поиск
        </button>
      </div>
      {hiddenSelected > 0 && (
        <button disabled={busy} onClick={onKeepVisibleOnly}>
          Оставить только видимые
        </button>
      )}
      <IconButton title="Снять выделение" onClick={onClearSelection}>
        <X size={16} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
