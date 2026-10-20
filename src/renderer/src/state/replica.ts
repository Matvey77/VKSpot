import type { Collection } from '../../../shared/model'
import type { StateCursor, StateSync, ViewState } from '../../../shared/sync'

/** Small control objects are reconciled recursively; collection contents are never deep-compared. */
function share<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next
  if (Array.isArray(previous) && Array.isArray(next)) {
    const result = next.map((value, index) => share(previous[index], value))
    return previous.length === result.length &&
      result.every((value, index) => value === previous[index])
      ? previous
      : (result as T)
  }
  if (Array.isArray(previous) || Array.isArray(next)) return next
  const before = previous as Record<string, unknown>,
    after = next as Record<string, unknown>
  const result: Record<string, unknown> = {}
  let unchanged = Object.keys(before).length === Object.keys(after).length
  for (const key of Object.keys(after)) {
    result[key] = share(before[key], after[key])
    if (result[key] !== before[key]) unchanged = false
  }
  return unchanged ? previous : (result as T)
}

/** A local replica preserves every unchanged row identity across service/progress updates. */
export class StateReplica {
  cursor: StateCursor | null = null
  state: ViewState | null = null
  private collections = new Map<string, Collection>()
  private positions = new Map<string, Map<string, number>>()

  apply(update: StateSync): ViewState {
    if (this.cursor?.session !== update.cursor.session) {
      this.collections.clear()
      this.positions.clear()
    }
    for (const item of update.updates) {
      if (item.kind === 'replace') {
        this.collections.set(item.collection.id, item.collection)
        this.positions.set(
          item.collection.id,
          new Map(item.collection.rows.map((row, index) => [row.id, index])),
        )
      } else {
        const previous = this.collections.get(item.id)
        if (!previous) throw new Error('Снимок коллекции устарел. Требуется повторная загрузка.')
        const rows = item.rows.length ? previous.rows.slice() : previous.rows
        const positions = this.positions.get(item.id)!
        for (const row of item.rows) {
          const index = positions.get(row.id)
          if (index === undefined) throw new Error('Неизвестная запись в обновлении коллекции.')
          rows[index] = row
        }
        this.collections.set(item.id, { ...previous, ...item.metadata, rows })
      }
    }
    const order = new Set(update.order)
    for (const id of this.collections.keys()) {
      if (!order.has(id)) {
        this.collections.delete(id)
        this.positions.delete(id)
      }
    }
    const collections = update.order.map((id) => {
      const collection = this.collections.get(id)
      if (!collection) throw new Error('Не удалось восстановить порядок коллекций.')
      return collection
    })
    const previous = this.state
    const stableCollections =
      previous &&
      previous.collections.length === collections.length &&
      collections.every((value, index) => value === previous.collections[index])
        ? previous.collections
        : collections
    const overview = previous
      ? {
          settings: share(previous.settings, update.overview.settings),
          jobs: share(previous.jobs, update.overview.jobs),
          spotify: share(previous.spotify, update.overview.spotify),
          vk: share(previous.vk, update.overview.vk),
          spotifyBrowser: share(previous.spotifyBrowser, update.overview.spotifyBrowser),
          dataPath: update.overview.dataPath,
        }
      : update.overview
    const next = { ...overview, collections: stableCollections }
    this.cursor = update.cursor
    this.state =
      previous &&
      Object.keys(next).every(
        (key) => previous[key as keyof ViewState] === next[key as keyof ViewState],
      )
        ? previous
        : next
    return this.state
  }

  reset(): void {
    this.cursor = null
  }
}
