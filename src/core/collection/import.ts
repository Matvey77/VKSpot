import { randomUUID } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import {
  archiveSchema,
  rawTrackSchema,
  type Collection,
  type ImportPreview,
  type RawTrack,
} from '../../shared/model'
import { sourceHash, validateCollection } from './integrity'

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
