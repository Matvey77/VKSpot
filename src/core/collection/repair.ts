import { randomUUID } from 'node:crypto'
import { rawTrackSchema } from '../../shared/model'
import type { Collection, ImportPreview, RawTrack, TrackRow } from '../../shared/types'

const titleKey = (track: RawTrack) =>
  `${track.artist.trim().toLocaleLowerCase()}\u0000${track.title.trim().toLocaleLowerCase()}`
type Occurrences = { rows: TrackRow[]; head: number; durations?: Map<number, Occurrences> }
function index(
  rows: TrackRow[],
  key: (row: TrackRow) => string,
  durations = false,
): Map<string, Occurrences> {
  const result = new Map<string, Occurrences>()
  for (const row of rows) {
    const value = key(row)
    if (!value) continue
    let queue = result.get(value)
    if (!queue) {
      queue = { rows: [], head: 0, ...(durations ? { durations: new Map() } : {}) }
      result.set(value, queue)
    }
    queue.rows.push(row)
    const duration = row.working.spotify?.duration ?? row.source.duration
    if (queue.durations && duration !== null) {
      const bucket = Math.floor(duration)
      let timed = queue.durations.get(bucket)
      if (!timed) {
        timed = { rows: [], head: 0 }
        queue.durations.set(bucket, timed)
      }
      timed.rows.push(row)
    }
  }
  return result
}
const hasWork = (row: TrackRow) =>
  row.working.destination !== 'unresolved' ||
  row.working.localPending ||
  row.working.reviewDeferred ||
  Boolean(row.working.note) ||
  row.working.excluded ||
  row.working.artist !== row.source.artist ||
  row.working.title !== row.source.title ||
  Boolean(row.working.version)

/** Match occurrences one-to-one. Repeated VK IDs may have different user decisions. */
export function mergeRepairedCollection(
  existing: Collection,
  preview: ImportPreview,
): { rows: TrackRow[]; preservedCount: number; addedCount: number } {
  const range = preview.range
  if (
    range &&
    (!Number.isInteger(range.from) ||
      !Number.isInteger(range.to) ||
      range.from < 1 ||
      range.to < range.from ||
      range.from > existing.rows.length + 1)
  )
    throw new Error('Диапазон синхронизации находится за пределами коллекции.')
  const sources = preview.tracks.map((raw) => rawTrackSchema.parse(raw))
  if (range && sources.length > range.to - range.from + 1)
    throw new Error('Количество записей превышает выбранный диапазон синхронизации.')
  const from = range ? range.from - 1 : 0
  // Cancellation or a short partial export must not erase the unread suffix of the range.
  const to = range
    ? Math.min(existing.rows.length, range.to, from + sources.length)
    : existing.rows.length
  const target = existing.rows.slice(from, to)
  const byId = index(target, (row) => row.source.id)
  const byText = index(target, (row) => row.source.rawText)
  const byTitle = index(target, (row) => titleKey(row.source), true)
  const used = new Set<string>()
  let preservedCount = range ? existing.rows.length - target.length : 0,
    addedCount = 0

  const peek = (queue: Occurrences): TrackRow | undefined => {
    while (queue.head < queue.rows.length && used.has(queue.rows[queue.head].id)) queue.head++
    return queue.rows[queue.head]
  }
  const take = (
    queue: Occurrences | undefined,
    source: RawTrack,
    preferDuration = false,
  ): TrackRow | undefined => {
    if (!queue) return undefined
    let exact: TrackRow | undefined
    if (preferDuration && source.duration !== null && queue.durations) {
      for (
        let second = Math.floor(source.duration - 5);
        second <= Math.floor(source.duration + 5);
        second++
      ) {
        const timed = queue.durations.get(second)
        if (!timed) continue
        peek(timed)
        for (let idx = timed.head; idx < timed.rows.length; idx++) {
          const row = timed.rows[idx]
          if (used.has(row.id)) continue
          const duration = row.working.spotify?.duration ?? row.source.duration
          if (duration != null && Math.abs(duration - source.duration) <= 5) {
            if (!exact || row.position < exact.position) exact = row
            break
          }
        }
      }
    }
    return exact ?? peek(queue)
  }

  const matches: (TrackRow | undefined)[] = new Array(sources.length)
  const claim = (index: number, matched: TrackRow | undefined): void => {
    if (!matched) return
    used.add(matched.id)
    matches[index] = matched
  }

  // Match across passes from strongest evidence to weakest so fuzzy hits never steal exact IDs.
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    if (source.id) claim(i, take(byId.get(source.id), source))
  }
  for (let i = 0; i < sources.length; i++) {
    if (matches[i]) continue
    const source = sources[i]
    if (source.rawText) claim(i, take(byText.get(source.rawText), source))
  }
  for (let i = 0; i < sources.length; i++) {
    if (matches[i]) continue
    const source = sources[i]
    claim(i, take(byTitle.get(titleKey(source)), source, true))
  }
  if (range && target.length === sources.length) {
    for (let i = 0; i < sources.length; i++) {
      if (matches[i]) continue
      const source = sources[i]
      const positional = target[i]
      if (
        positional &&
        !source.id &&
        !positional.source.id &&
        !used.has(positional.id) &&
        source.artist.trim().toLocaleLowerCase() ===
          positional.source.artist.trim().toLocaleLowerCase()
      ) {
        claim(i, positional)
      }
    }
  }

  const repaired = sources.map((source, index): TrackRow => {
    const matched = matches[index]
    if (matched) {
      preservedCount++
      return { ...matched, source }
    }
    addedCount++
    return {
      id: randomUUID(),
      position: 0,
      source,
      working: {
        artist: source.artist,
        title: source.title,
        version: '',
        excluded: false,
        note: '',
        destination: 'unresolved',
        spotify: null,
        local: null,
        candidates: [],
        searchedQuery: null,
        localPending: false,
        reviewDeferred: false,
      },
    }
  })

  // A missing source row with user work remains explicit, including within a partial repair.
  const retained = target.filter((row) => !used.has(row.id) && hasWork(row))
  preservedCount += retained.length
  const combined = range
    ? [...existing.rows.slice(0, from), ...repaired, ...retained, ...existing.rows.slice(to)]
    : [...repaired, ...retained]
  return {
    rows: combined.map((row, index) =>
      row.position === index + 1 ? row : { ...row, position: index + 1 },
    ),
    preservedCount,
    addedCount,
  }
}
