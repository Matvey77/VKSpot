import { randomUUID } from 'node:crypto'
import type { Collection, TrackRow } from '../../shared/model'
import type { CollectionUpdate, StateCursor } from '../../shared/sync'

type Change = { revision: number; id: string; kind: 'replace' | 'rows' | 'metadata'; ids: string[] }

/** Bounded identifiers only: the journal never retains old collections or working copies. */
export class CollectionChanges {
  private readonly session = randomUUID()
  private revision = 0
  private floor = 0
  private changes: Change[] = []
  private retainedIds = 0

  record(id: string, kind: Change['kind'], ids: string[] = []): void {
    this.revision++
    this.changes.push({ revision: this.revision, id, kind, ids })
    this.retainedIds += ids.length
    while (this.changes.length > 512 || this.retainedIds > 20000) {
      const removed = this.changes.shift()!
      this.floor = removed.revision
      this.retainedIds -= removed.ids.length
    }
  }

  since(
    cursor: StateCursor | null,
    collections: Collection[],
  ): { cursor: StateCursor; updates: CollectionUpdate[] } {
    const next = { session: this.session, revision: this.revision }
    if (
      !cursor ||
      cursor.session !== this.session ||
      cursor.revision < this.floor ||
      cursor.revision > this.revision
    ) {
      return {
        cursor: next,
        updates: collections.map((collection) => ({ kind: 'replace', collection })),
      }
    }
    if (cursor.revision === this.revision) return { cursor: next, updates: [] }
    const grouped = new Map<string, { replace: boolean; metadata: boolean; ids: Set<string> }>()
    for (const change of this.changes) {
      if (change.revision <= cursor.revision) continue
      let group = grouped.get(change.id)
      if (!group) {
        group = { replace: false, metadata: false, ids: new Set() }
        grouped.set(change.id, group)
      }
      if (change.kind === 'replace') group.replace = true
      if (change.kind === 'metadata') group.metadata = true
      for (const id of change.ids) group.ids.add(id)
    }
    const updates: CollectionUpdate[] = []
    for (const collection of collections) {
      const group = grouped.get(collection.id)
      if (!group) continue
      if (group.replace) updates.push({ kind: 'replace', collection })
      else {
        const { rows, ...metadata } = collection
        // Scan once per changed collection, never once per changed row.
        const changed: TrackRow[] = group.ids.size
          ? rows.filter((row) => group.ids.has(row.id))
          : []
        updates.push({
          kind: 'patch',
          id: collection.id,
          rows: changed,
          ...(group.metadata ? { metadata } : {}),
        })
      }
    }
    return { cursor: next, updates }
  }
}
