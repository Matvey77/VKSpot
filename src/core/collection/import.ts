import { randomUUID } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { archiveSchema, rawTrackSchema } from '../../shared/model'
import type { Collection, ImportPreview, RawTrack, TrackRow } from '../../shared/types'
import { sourceHash, validateCollection } from './integrity'

const validatedTracks = new WeakMap<RawTrack[], number>()
const validatedCollections = new WeakMap<
  Collection,
  { sourceHash: string; rowCount: number; rows: TrackRow[] }
>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textField(value: unknown, field: string, index: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new Error(`Запись ${index + 1}: поле ${field} должно быть строкой или числом.`)
}

function isBlockedFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase()
    if (norm === '' || norm === 'false' || norm === '0') return false
    if (norm === 'true' || norm === '1') return true
  }
  return Boolean(value)
}

function detectCsvDelimiter(text: string): string {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let inQuotes = false
  let headerOutsideQuotes = ''
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) break
    if (!inQuotes) headerOutsideQuotes += ch
  }
  if (headerOutsideQuotes.includes(';')) return ';'
  if (headerOutsideQuotes.includes('\t')) return '\t'
  return ','
}

export function createCollection(preview: ImportPreview): Collection {
  if (preview.restored) {
    const verified = validatedCollections.get(preview.restored)
    if (
      !verified ||
      verified.sourceHash !== preview.restored.sourceHash ||
      verified.rowCount !== preview.restored.rows.length ||
      verified.rows !== preview.restored.rows
    ) {
      validateCollection(preview.restored)
    }
    return preview.restored
  }
  const skipParse = validatedTracks.get(preview.tracks) === preview.tracks.length
  const rows = preview.tracks.map((track, i) => {
    const source = skipParse ? track : rawTrackSchema.parse(track)
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
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new Error(`Некорректная длительность: ${String(value)}`)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Некорректная длительность: ${String(value)}`)
    return value
  }
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.includes(':')) {
    const rawParts = trimmed.split(':')
    if (
      (rawParts.length !== 2 && rawParts.length !== 3) ||
      rawParts.some((part) => !/^\d+$/.test(part))
    )
      throw new Error(`Некорректная длительность: ${value}`)
    const parts = rawParts.map(Number)
    if (parts.length === 2 && parts[1] >= 60) throw new Error(`Некорректная длительность: ${value}`)
    if (parts.length === 3 && (parts[1] >= 60 || parts[2] >= 60))
      throw new Error(`Некорректная длительность: ${value}`)
    const total = parts.reduce((sum, n) => sum * 60 + n, 0)
    if (!Number.isFinite(total) || total < 0) throw new Error(`Некорректная длительность: ${value}`)
    return total
  }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Некорректная длительность: ${String(value)}`)
  return n
}

function mapTrack(raw: unknown, index: number): RawTrack {
  if (!isRecord(raw)) throw new Error(`Запись ${index + 1}: ожидается объект записи.`)
  const artist = textField(
    raw.artist ?? raw.performer ?? raw['Исполнитель'] ?? raw.source_artist,
    'artist',
    index,
  )
  const title = raw.title ?? raw.name ?? raw['Название'] ?? raw.source_title
  if (title === undefined || typeof title !== 'string')
    throw new Error(`Запись ${index + 1}: требуется текстовое поле title / Название.`)
  const rawAvailability =
    typeof raw.availability === 'string' && raw.availability.trim() === ''
      ? undefined
      : raw.availability
  return rawTrackSchema.parse({
    id: textField(raw.vkId ?? raw.vk_id ?? raw.id, 'id', index),
    artist,
    title,
    duration: duration(raw.duration ?? raw['Длительность']),
    availability: rawAvailability ?? (isBlockedFlag(raw.blocked) ? 'blocked' : 'unknown'),
    url: textField(raw.url, 'url', index),
    rawText: typeof raw.rawText === 'string' ? raw.rawText : JSON.stringify(raw),
  })
}

export function parseImport(text: string, extension: string, name: string): ImportPreview {
  const empty = {
    expected: null,
    status: 'unverified' as const,
    reason: 'file-import' as const,
    message: 'Файл сохранён целиком. Полнота списка VK не подтверждена.',
  }
  if (extension.toLowerCase() === '.json') {
    const jsonText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const data: unknown = JSON.parse(jsonText)
    if (!Array.isArray(data) && !isRecord(data))
      throw new Error('JSON должен содержать массив записей или объект с полем tracks.')
    if (isRecord(data) && data.format === 'vkspot') {
      if (data.version !== 1)
        throw new Error(`Неподдерживаемая версия архива VKSpot: ${String(data.version)}.`)
      const archive = archiveSchema.parse(data)
      validateCollection(archive.collection)
      validatedCollections.set(archive.collection, {
        sourceHash: archive.collection.sourceHash,
        rowCount: archive.collection.rows.length,
        rows: archive.collection.rows,
      })
      const tracks = archive.collection.rows.map((r) => r.source)
      validatedTracks.set(tracks, tracks.length)
      return {
        name: archive.collection.name,
        origin: archive.collection.origin,
        tracks,
        completeness: archive.collection.completeness,
        restored: archive.collection,
      }
    }
    const records: unknown = Array.isArray(data) ? data : data.tracks
    if (!Array.isArray(records))
      throw new Error('JSON должен содержать массив записей или объект с полем tracks.')
    if (records.length === 0) throw new Error('Файл не содержит записей для импорта.')
    const rawExpected = !Array.isArray(data)
      ? (data.expectedCount ?? (isRecord(data.completeness) ? data.completeness.expected : null))
      : null
    const expected =
      typeof rawExpected === 'number' && Number.isInteger(rawExpected) && rawExpected >= 0
        ? rawExpected
        : null
    const verified = expected !== null && expected === records.length
    const tracks = records.map(mapTrack)
    validatedTracks.set(tracks, tracks.length)
    return {
      name,
      origin: 'JSON',
      tracks,
      completeness: {
        expected,
        status: verified ? 'verified-count' : 'unverified',
        reason: verified ? 'verified' : 'file-import',
        message: verified
          ? 'Количество совпадает с заявленным в выгрузке. Доступность записей проверяется отдельно.'
          : empty.message,
      },
    }
  }
  if (extension.toLowerCase() === '.csv') {
    const delimiter = detectCsvDelimiter(text)
    const records = parse(text, {
      columns: true,
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: false,
    }) as Record<string, unknown>[]
    if (records.length === 0) throw new Error('Файл не содержит записей для импорта.')
    const tracks = records.map(mapTrack)
    validatedTracks.set(tracks, tracks.length)
    return { name, origin: 'CSV', tracks, completeness: empty }
  }
  const txtText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = txtText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) throw new Error('Файл не содержит записей для импорта.')
  const records = lines.map((line) => {
    const separator = line.indexOf(' - ')
    return rawTrackSchema.parse({
      artist: separator >= 0 ? line.slice(0, separator) : '',
      title: separator >= 0 ? line.slice(separator + 3) : line,
      rawText: line,
    })
  })
  validatedTracks.set(records, records.length)
  return { name, origin: 'TXT', tracks: records, completeness: empty }
}
