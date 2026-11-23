import { z } from 'zod'
import { rawTrackSchema } from '../shared/model'
import { formatCount, formatRecordsGenitive } from '../shared/ru'
import type { CompletenessReason, ImportPreview } from '../shared/types'

export const vkExportOptionsSchema = z
  .object({
    expectedCount: z.number().int().nonnegative().max(1_000_000).nullish().default(null),
    rangeFrom: z.number().int().positive().max(1_000_000).nullish().default(null),
    rangeTo: z.number().int().positive().max(1_000_000).nullish().default(null),
    limit: z.number().int().positive().max(1_000_000).nullish().default(null),
  })
  .refine((o) => o.rangeFrom == null || o.rangeTo == null || o.rangeFrom <= o.rangeTo, {
    message: 'Начальная позиция диапазона не может превышать конечную.',
    path: ['rangeTo'],
  })
export type VKExportOptions = z.infer<typeof vkExportOptionsSchema>

export const vkProgressSchema = z.object({
  collected: z.number().int().nonnegative().default(0),
  expected: z.number().int().nonnegative().nullish().default(null),
  message: z.string().max(1000).default(''),
})

const domTrackSchema = rawTrackSchema.extend({
  duration: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null),
    z.number().finite().nonnegative().nullable(),
  ),
})

const resultSchema = z.object({
  tracks: z.array(domTrackSchema).min(1),
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
      .refine((r) => r.from <= r.to, {
        message: 'Начальная позиция диапазона не может превышать конечную.',
        path: ['to'],
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
    requestedCount !== null &&
    data.expectedCount !== null &&
    requestedCount !== data.expectedCount &&
    !(isPartialRange && data.expectedCount > requestedCount)
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
    details.push(
      `Собрано ${formatCount(data.tracks.length)} из ожидаемых ${formatRecordsGenitive(expected)}.`,
    )
  else details.push('Счётчик общего числа записей в разметке VK не указан.')
  if (conflictingCount && data.expectedCount !== null)
    details.push(
      `VK сообщает другое число: ${formatCount(data.expectedCount)}. Проверь выбранный список.`,
    )
  if (missing)
    details.push(`У ${formatRecordsGenitive(missing)} не прочитано название или исполнитель.`)
  details.push(
    verified
      ? isPartialRange
        ? 'Выбранный диапазон успешно собран.'
        : 'Количество совпало. Сверь первые и последние записи с VK.'
      : 'Сверь количество с разделом «Моя музыка» в VK.',
  )
  const completenessReason: CompletenessReason = verified
    ? 'verified'
    : data.extraction.reason === 'cancelled'
      ? 'cancelled'
      : data.extraction.reason === 'timeout'
        ? 'timeout'
        : data.extraction.reason === 'gap'
          ? 'gap'
          : data.extraction.reason === 'page-changed'
            ? 'page-changed'
            : data.extraction.reason === 'limit'
              ? 'limit'
              : expected !== null && data.tracks.length !== expected
                ? 'count-mismatch'
                : 'end-of-list'
  return {
    name: 'Моя музыка VK',
    origin: 'VK DOM',
    tracks: data.tracks,
    range: data.range ?? undefined,
    completeness: {
      expected: expected ?? null,
      status: verified ? 'verified-count' : 'unverified',
      message: details.join(' '),
      reason: completenessReason,
    },
  }
}
