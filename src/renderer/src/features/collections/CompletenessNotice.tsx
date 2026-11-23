import { Info, Lightbulb, X } from 'lucide-react'
import { formatCount, formatRecordsCount, formatRecordsGenitive } from '../../../../shared/ru'
import type { Completeness } from '../../../../shared/types'

interface CompletenessNoticeProps {
  completeness: Completeness
  totalCount: number
  onDismiss: () => void
}

type NoticeKind =
  | 'count-mismatch'
  | 'cancelled'
  | 'timeout'
  | 'gap'
  | 'page-changed'
  | 'limit'
  | 'file-import'
  | 'end-of-list'

function resolveNoticeKind(completeness: Completeness): NoticeKind {
  const reason = completeness.reason
  if (reason && reason !== 'unknown' && reason !== 'verified') {
    if (reason === 'count-mismatch' && completeness.expected === null) {
      return 'end-of-list'
    }
    return reason
  }
  const msg = completeness.message || ''
  if (completeness.expected !== null && msg.includes('из ожидаемых')) return 'count-mismatch'
  if (msg.includes('Сбор остановлен пользователем')) return 'cancelled'
  if (msg.includes('предел времени') || msg.includes('таймаут')) return 'timeout'
  if (msg.includes('непрерывный порядок') || msg.includes('пропущенные')) return 'gap'
  if (msg.includes('изменилась страница')) return 'page-changed'
  if (msg.includes('предел проходов')) return 'limit'
  if (msg.includes('Файл сохранён целиком')) return 'file-import'
  return 'end-of-list'
}

export function CompletenessNotice({
  completeness,
  totalCount,
  onDismiss,
}: CompletenessNoticeProps) {
  const kind = resolveNoticeKind(completeness)

  let title: string
  let badge: string
  let explanation: string
  let hint: string

  if (kind === 'count-mismatch' && completeness.expected !== null) {
    title = `Собрано ${formatCount(totalCount)} из ожидаемых ${formatRecordsGenitive(completeness.expected)}`
    badge = 'Частичный список'
    explanation = `При импорте ожидалось: ${formatRecordsCount(completeness.expected)}, а получено: ${formatRecordsCount(totalCount)}.`
    hint = 'Проверь, нет ли скрытых или недоступных записей в VK.'
  } else if (kind === 'cancelled') {
    title = `Сбор остановлен пользователем (${formatRecordsCount(totalCount)})`
    badge = 'Остановлено'
    explanation = 'Выгрузка была остановлена до конца страницы.'
    hint = 'Если нужны все записи, запусти импорт списка повторно.'
  } else if (kind === 'timeout') {
    title = `Достигнут предел времени выгрузки (${formatRecordsCount(totalCount)})`
    badge = 'Таймаут VK'
    explanation = 'Страница VK долго не отдавала новые записи при автоматической прокрутке.'
    hint = 'Проверь интернет-соединение или повтори выгрузку при стабильной сети.'
  } else if (kind === 'gap') {
    title = 'Возможен пропуск записей при прокрутке'
    badge = 'Внимание'
    explanation = 'При автоматической прокрутке страницы произошёл скачок ленты записей.'
    hint = 'Сверь первые и последние записи списка с разделом «Моя музыка» в VK.'
  } else if (kind === 'page-changed') {
    title = 'Страница VK изменилась во время выгрузки'
    badge = 'Прервано'
    explanation = 'Во время сбора записей произошёл переход на другой раздел VK.'
    hint = 'При необходимости повтори выгрузку, оставаясь в разделе «Моя музыка».'
  } else if (kind === 'limit') {
    title = `Достигнут предел проходов выгрузки (${formatRecordsCount(totalCount)})`
    badge = 'Предел проходов'
    explanation =
      completeness.expected !== null
        ? `Выгрузка остановилась после достижения лимита проходов: собрано ${formatCount(totalCount)} из ожидаемых ${formatRecordsGenitive(completeness.expected)}.`
        : `Выгрузка остановилась после достижения лимита проходов, сохранено: ${formatRecordsCount(totalCount)}.`
    hint = 'Сверь количество с разделом «Моя музыка» в VK или обнови список через «Сверить список».'
  } else if (kind === 'file-import') {
    title = `Список из файла сохранён (${formatRecordsCount(totalCount)})`
    badge = 'Импорт из файла'
    explanation = 'Файл сохранён целиком. Автоматическая сверка полноты с VK не проводилась.'
    hint = 'При необходимости сверь список с разделом «Моя музыка» в VK.'
  } else {
    title = 'Список выгружен до конца страницы'
    badge = 'Счётчик VK не указан'
    explanation = `Лента записей прокручена до самого низа, сохранено: ${formatRecordsCount(totalCount)}. VK не передал в коде страницы точное число всех записей, поэтому автоматическая сверка количества не проводилась.`
    hint = `Сравни число записей (${formatCount(totalCount)}) со счётчиком в разделе «Моя музыка» в VK.`
  }

  return (
    <div className="completeness-notice-wrapper">
      <div className="review-source-status-frame">
        <details className="review-source-status" open>
          <summary>
            <Info size={16} className="review-source-status-icon" aria-hidden="true" />
            <span className="review-source-status-title">{title}</span>
            <span className="review-source-status-badge">{badge}</span>
          </summary>
          <div className="review-source-status-content">
            <p className="review-source-status-desc">{explanation}</p>
            {hint && (
              <p className="review-source-status-hint">
                <Lightbulb size={14} aria-hidden="true" />
                <span>{hint}</span>
              </p>
            )}
          </div>
        </details>
        <button
          type="button"
          className="notice-dismiss-btn"
          onClick={onDismiss}
          aria-label="Закрыть уведомление"
          title="Закрыть уведомление"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default CompletenessNotice
