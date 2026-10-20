import { createHash } from 'node:crypto'
import type { Collection, TrackRow } from '../../shared/model'

export function sourceHash(rows: Pick<TrackRow, 'position' | 'source'>[]): string {
  return createHash('sha256')
    .update(JSON.stringify(rows.map((r) => ({ position: r.position, source: r.source }))))
    .digest('hex')
}

export function validateCollection(collection: Collection): void {
  if (new Set(collection.rows.map((r) => r.id)).size !== collection.rows.length)
    throw new Error('Архив содержит повторяющиеся идентификаторы записей.')
  if (collection.rows.some((r, i) => r.position !== i + 1))
    throw new Error('В архиве нарушена исходная последовательность.')
  if (sourceHash(collection.rows) !== collection.sourceHash)
    throw new Error('Исходный список изменён: контрольная сумма не совпадает.')
}
