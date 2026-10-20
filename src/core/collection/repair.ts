import { randomUUID } from 'node:crypto'
import {
  rawTrackSchema,
  type Collection,
  type ImportPreview,
  type RawTrack,
  type TrackRow,
} from '../../shared/model'

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
  if (range && (range.to < range.from || range.from > existing.rows.length + 1))
    throw new Error('Диапазон синхронизации находится за пределами коллекции.')
  const from = range ? range.from - 1 : 0
  // Cancellation or a short partial export must not erase the unread suffix of the range.
  const to = range
    ? Math.min(existing.rows.length, range.to, from + preview.tracks.length)
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
        const row = timed && peek(timed)
        const duration = row?.working.spotify?.duration ?? row?.source.duration
        if (
          row &&
          duration != null &&
          Math.abs(duration - source.duration) <= 5 &&
          (!exact || row.position < exact.position)
        )
          exact = row
      }
    }
    return exact ?? peek(queue)
  }

  const repaired = preview.tracks.map((raw, index): TrackRow => {
    const source = rawTrackSchema.parse(raw)
    const positional = range && target.length === preview.tracks.length ? target[index] : undefined
    const matched =
      (source.id ? take(byId.get(source.id), source) : undefined) ??
      (source.rawText ? take(byText.get(source.rawText), source) : undefined) ??
      take(byTitle.get(titleKey(source)), source, true) ??
      (positional &&
      !source.id &&
      !positional.source.id &&
      !used.has(positional.id) &&
      source.artist.trim().toLocaleLowerCase() ===
        positional.source.artist.trim().toLocaleLowerCase()
        ? positional
        : undefined)
    if (matched) {
      used.add(matched.id)
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
