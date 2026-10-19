import { createHash, randomUUID } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import {
  archiveSchema,
  rawTrackSchema,
  type Collection,
  type ImportPreview,
  type PlanItem,
  type RawTrack,
  type TrackRow,
} from '../shared/model'

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
export function createCollection(preview: ImportPreview): Collection {
  if (preview.restored) {
    validateCollection(preview.restored)
    return preview.restored
  }
  const rows = preview.tracks.map((track, i) => {
    const source = rawTrackSchema.parse(track)
    return {
      id: randomUUID(),
      position: i + 1,
      source,
      working: {
        artist: source.artist,
        title: source.title,
        version: '',
        excluded: false,
        note: '',
        destination: 'unresolved' as const,
        spotify: null,
        local: null,
        candidates: [],
        searchedQuery: null,
        localPending: false,
        reviewDeferred: false,
      },
    }
  })
  return {
    id: randomUUID(),
    name: preview.name,
    importedAt: new Date().toISOString(),
    origin: preview.origin,
    completeness: preview.completeness,
    sourceHash: sourceHash(rows),
    rows,
  }
}
function duration(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.includes(':')) {
    const parts = value.split(':').map(Number)
    if (parts.some((n) => !Number.isFinite(n) || n < 0))
      throw new Error(`Некорректная длительность: ${value}`)
    return parts.reduce((sum, n) => sum * 60 + n, 0)
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Некорректная длительность: ${String(value)}`)
  return n
}
function mapTrack(record: Record<string, unknown>, index: number): RawTrack {
  const artist =
    record.artist ?? record.performer ?? record['Исполнитель'] ?? record.source_artist ?? ''
  const title = record.title ?? record.name ?? record['Название'] ?? record.source_title
  if (title === undefined || typeof title !== 'string')
    throw new Error(`Запись ${index + 1}: требуется текстовое поле title / Название.`)
  return rawTrackSchema.parse({
    id: String(record.vkId ?? record.vk_id ?? record.id ?? ''),
    artist: String(artist),
    title,
    duration: duration(record.duration ?? record['Длительность']),
    availability: record.availability ?? (record.blocked ? 'blocked' : 'unknown'),
    url: String(record.url ?? ''),
    rawText: typeof record.rawText === 'string' ? record.rawText : JSON.stringify(record),
  })
}
export function parseImport(text: string, extension: string, name: string): ImportPreview {
  const empty = {
    expected: null,
    status: 'unverified' as const,
    message: 'Файл сохранён целиком. Полнота коллекции VK не подтверждена.',
  }
  if (extension.toLowerCase() === '.json') {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (data?.format === 'vkspot') {
      const archive = archiveSchema.parse(data)
      validateCollection(archive.collection)
      return {
        name: archive.collection.name,
        origin: archive.collection.origin,
        tracks: archive.collection.rows.map((r) => r.source),
        completeness: archive.collection.completeness,
        restored: archive.collection,
      }
    }
    const records = Array.isArray(data) ? data : data.tracks
    if (!Array.isArray(records))
      throw new Error('JSON должен содержать массив записей или объект с полем tracks.')
    const expected =
      Number.isInteger(data.expectedCount) && data.expectedCount >= 0 ? data.expectedCount : null
    return {
      name,
      origin: 'JSON',
      tracks: records.map(mapTrack),
      completeness: {
        ...empty,
        expected,
        status: expected !== null && expected === records.length ? 'verified-count' : 'unverified',
        message:
          expected !== null && expected === records.length
            ? 'Количество совпадает с заявленным в выгрузке. Доступность записей проверяется отдельно.'
            : empty.message,
      },
    }
  }
  if (extension.toLowerCase() === '.csv') {
    const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]
    const delimiter = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','
    const records = parse(text, {
      columns: true,
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: false,
    }) as Record<string, unknown>[]
    return { name, origin: 'CSV', tracks: records.map(mapTrack), completeness: empty }
  }
  const records = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const separator = line.indexOf(' - ')
      return rawTrackSchema.parse({
        artist: separator >= 0 ? line.slice(0, separator) : '',
        title: separator >= 0 ? line.slice(separator + 3) : line,
        rawText: line,
      })
    })
  return { name, origin: 'TXT', tracks: records, completeness: empty }
}
export function makePlan(collection: Collection): PlanItem[] {
  return collection.rows
    .filter((r) => !r.working.excluded)
    .map((r) => {
      const w = r.working
      if (w.destination === 'spotify' && w.spotify)
        return {
          rowId: r.id,
          position: r.position,
          artist: w.artist,
          title: w.title,
          version: w.version,
          destination: 'spotify',
          uri: w.spotify.uri,
          local: null,
        }
      if (w.destination === 'local' && w.local)
        return {
          rowId: r.id,
          position: r.position,
          artist: w.artist,
          title: w.title,
          version: w.version,
          destination: 'local',
          uri: null,
          local: w.local,
        }
      throw new Error(
        `Запись №${r.position} «${w.title}» не готова. Выберите совпадение, локальный файл или отметьте «исключить».`,
      )
    })
}
export function csvExport(collection: Collection): string {
  return (
    '\uFEFF' +
    stringify(
      collection.rows.map((r) => ({
        position: r.position,
        vk_id: r.source.id,
        source_artist: r.source.artist,
        source_title: r.source.title,
        duration: r.source.duration ?? '',
        availability: r.source.availability,
        artist: r.working.artist,
        title: r.working.title,
        version: r.working.version,
        excluded: r.working.excluded,
        destination: r.working.destination,
        spotify_uri: r.working.spotify?.uri ?? '',
        local_path: r.working.local?.path ?? '',
        note: r.working.note,
      })),
      { header: true, quoted: true },
    )
  )
}
export function exportText(collection: Collection, format: string): string {
  if (format === 'archive')
    return JSON.stringify({ format: 'vkspot', version: 1, collection }, null, 2)
  if (format === 'raw-json')
    return JSON.stringify(
      {
        format: 'vkspot-raw',
        sourceHash: collection.sourceHash,
        completeness: collection.completeness,
        tracks: collection.rows.map((r) => ({ position: r.position, ...r.source })),
      },
      null,
      2,
    )
  if (format === 'csv') return csvExport(collection)
  const plan = makePlan(collection)
  if (format === 'plan')
    return JSON.stringify(
      {
        format: 'vkspot-plan',
        version: 1,
        name: collection.name,
        sourceHash: collection.sourceHash,
        items: plan,
      },
      null,
      2,
    )
  return (
    '#EXTM3U\n' +
    plan
      .map(
        (r) =>
          `#EXTINF:${r.local?.duration ?? -1},${r.artist.replace(/[\r\n]/g, ' ')} - ${r.title.replace(/[\r\n]/g, ' ')}\n${r.local?.path ?? r.uri}`,
      )
      .join('\n') +
    '\n'
  )
}
export function reconcilePrefix(expected: string[], actual: string[]): number {
  if (actual.length > expected.length || actual.some((uri, i) => uri !== expected[i]))
    throw new Error(
      'Состав плейлиста отличается от плана. Автоматическое продолжение остановлено для проверки.',
    )
  return actual.length
}

export function mixedOrder(plan: PlanItem[], actual: string[]): string[] {
  if (actual.length !== plan.length)
    throw new Error(
      `В плейлисте ${actual.length} записей, в плане ${plan.length}. Добавьте все локальные записи, включая повторы, и удалите посторонние записи.`,
    )
  const used = new Set<number>()
  return plan.map((item) => {
    const index = actual.findIndex((uri, i) => {
      if (used.has(i)) return false
      if (item.destination === 'spotify') return uri === item.uri
      if (!uri.startsWith('spotify:local:') || !item.local?.title) return false
      const parts = uri.split(':').slice(2)
      if (parts.length !== 4) return false
      const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '))
      return (
        decode(parts[0]) === item.local.artist &&
        decode(parts[2]) === item.local.title &&
        item.local.duration !== null &&
        Math.abs(Number(parts[3]) - item.local.duration) <= 1
      )
    })
    if (index < 0)
      throw new Error(
        `Не удалось однозначно связать запись №${item.position} с плейлистом. Для локальных файлов нужны корректные теги исполнителя, названия и длительность. Сверьте запись вручную; перестановка не начата.`,
      )
    used.add(index)
    return actual[index]
  })
}
