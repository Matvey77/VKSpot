import { Info, X } from 'lucide-react'
import type { Completeness } from '../../../../shared/types'

interface CompletenessNoticeProps {
  completeness: Completeness
  totalCount: number
  onDismiss: () => void
}

export function CompletenessNotice({
  completeness,
  totalCount,
  onDismiss,
}: CompletenessNoticeProps) {
  const msg = completeness.message || ''
  const reason = completeness.reason

  let title: string
  let badge: string
  let explanation: string
  let hint: string

  if (
    completeness.expected !== null &&
    (reason === 'count-mismatch' || msg.includes('из ожидаемых'))
  ) {
    title = `Собрано ${totalCount} из ${completeness.expected} ожидаемых записей`
    badge = 'Частичный список'
    explanation = `При импорте ожидалось ${completeness.expected} записей, но получено ${totalCount}.`
    hint = 'Проверьте, нет ли скрытых или недоступных записей в VK.'
  } else if (reason === 'cancelled' || msg.includes('Сбор остановлен пользователем')) {
    title = `Сбор остановлен пользователем (${totalCount} записей)`
    badge = 'Остановлено'
    explanation = 'Выгрузка была остановлена до достижения конца страницы.'
    hint = 'Если вам нужны все треки, вы можете запустить импорт списка повторно.'
  } else if (reason === 'timeout' || msg.includes('предел времени') || msg.includes('таймаут')) {
    title = `Достигнут предел времени выгрузки (${totalCount} записей)`
    badge = 'Таймаут VK'
    explanation = 'Страница VK долго не отдавала новые строки при автоматической прокрутке.'
    hint = 'Проверьте интернет-соединение или повторите выгрузку при стабильной сети.'
  } else if (
    reason === 'gap' ||
    msg.includes('непрерывный порядок') ||
    msg.includes('пропущенные')
  ) {
    title = 'Возможен пропуск записей при прокрутке'
    badge = 'Внимание'
    explanation = 'При автоматической прокрутке страницы произошёл скачок ленты треков.'
    hint = 'Рекомендуем сверить первые и последние записи списка с музыкой в VK.'
  } else if (reason === 'page-changed' || msg.includes('изменилась страница')) {
    title = 'Страница VK изменилась во время выгрузки'
    badge = 'Прервано'
    explanation = 'Во время сбора треков произошел переход на другой раздел VK.'
    hint = 'При необходимости повторите выгрузку, оставаясь в разделе «Моя музыка».'
  } else {
    title = 'Список выгружен до конца страницы'
    badge = 'Счётчик VK не указан'
    explanation = `Лента аудиозаписей прокручена до самого низа, сохранено ${totalCount} записей. VK не передал в коде страницы точное число всех аудиозаписей, поэтому автоматическая сверка количества не проводилась.`
    hint = `Вы можете сравнить число записей (${totalCount}) со счётчиком в «Моя музыка» в VK.`
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
            {hint && <p className="review-source-status-hint">💡 {hint}</p>}
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
