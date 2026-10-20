import { z } from 'zod'
import { rawTrackSchema, type ImportPreview } from '../shared/model'

export const vkExportOptionsSchema = z.object({
  expectedCount: z.number().int().nonnegative().max(1_000_000).nullish().default(null),
  rangeFrom: z.number().int().positive().max(1_000_000).nullish().default(null),
  rangeTo: z.number().int().positive().max(1_000_000).nullish().default(null),
  limit: z.number().int().positive().max(1_000_000).nullish().default(null),
})
export type VKExportOptions = z.infer<typeof vkExportOptionsSchema>

export const vkProgressSchema = z.object({
  collected: z.number().int().nonnegative().default(0),
  expected: z.number().int().nonnegative().nullish().default(null),
  message: z.string().max(1000).default(''),
})
const resultSchema = z.object({
  tracks: z.array(rawTrackSchema).min(1),
  expectedCount: z.preprocess(
    (v) => (v === undefined ? null : v),
    z.number().int().nonnegative().nullable(),
  ),
  range: z.preprocess(
    (v) => (v === null ? undefined : v),
    z
      .object({
        from: z.number().int().positive(),
        to: z.number().int().positive(),
      })
      .optional(),
  ),
  extraction: z.object({
    reason: z.enum(['end', 'cancelled', 'gap', 'page-changed', 'timeout', 'limit']),
    missingMetadata: z.number().int().nonnegative(),
    reachedEnd: z.boolean(),
  }),
})

export function vkImportPreview(
  value: unknown,
  requested?: VKExportOptions | number | null,
): ImportPreview {
  const data = resultSchema.parse(value)
  if (data.tracks.every((track) => !track.artist.trim() && !track.title.trim()))
    throw new Error('VK вернул строки без названий и исполнителей. Пустая выгрузка не сохранена.')
  const requestedCount =
    typeof requested === 'number'
      ? requested
      : (requested?.expectedCount ??
        (requested?.rangeTo && requested?.rangeFrom
          ? requested.rangeTo - requested.rangeFrom + 1
          : (requested?.limit ?? null)))
  const isPartialRange = Boolean(
    (requested && typeof requested === 'object' && (requested.rangeTo || requested.limit)) ||
    data.range,
  )
  const expected = requestedCount ?? data.expectedCount
  const missing = data.tracks.filter((track) => !track.artist.trim() || !track.title.trim()).length
  const countMatches = expected !== null && data.tracks.length === expected
  const conflictingCount =
    requestedCount !== null && data.expectedCount !== null && requestedCount !== data.expectedCount
  const verified =
    countMatches &&
    !conflictingCount &&
    (data.extraction.reason === 'end' || (isPartialRange && data.extraction.reason === 'limit')) &&
    data.extraction.reachedEnd &&
    missing === 0
  const reasons = {
    end: 'Страница VK прокручена до конца.',
    cancelled: 'Сбор остановлен пользователем.',
    gap: 'Не удалось подтвердить непрерывный порядок. Возможны пропущенные записи.',
    'page-changed': 'Во время сбора изменилась страница VK.',
    timeout: 'Достигнут предел времени сбора.',
    limit: isPartialRange
      ? 'Достигнут заданный лимит выгрузки.'
      : 'Достигнут предел проходов сбора.',
  }
  const details = [reasons[data.extraction.reason]]
  if (expected !== null)
    details.push(`Собрано ${data.tracks.length} из ожидаемых ${expected} записей.`)
  else details.push('Счётчик общего числа записей в разметке VK не указан.')
  if (
    requestedCount !== null &&
    data.expectedCount !== null &&
    requestedCount !== data.expectedCount
  )
    details.push(`VK сообщает другое число: ${data.expectedCount}. Проверьте выбранный список.`)
  if (missing) details.push(`У ${missing} записей не прочитано название или исполнитель.`)
  details.push(
    verified
      ? isPartialRange
        ? 'Выбранный диапазон успешно собран.'
        : 'Количество совпало. Сверьте первые и последние записи с VK.'
      : 'Рекомендуем сверить количество с «Моя музыка» в VK.',
  )
  return {
    name: 'Моя музыка VK',
    origin: 'VK DOM',
    tracks: data.tracks,
    range: data.range ?? undefined,
    completeness: {
      expected: expected ?? null,
      status: verified ? 'verified-count' : 'unverified',
      message: details.join(' '),
    },
  }
}
