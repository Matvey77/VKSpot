import { randomUUID } from 'node:crypto'
import type { Collection, TrackRow } from '../../shared/model'
import type { CollectionMetadata, CollectionUpdate, StateCursor } from '../../shared/sync'

type Change = { revision: number; id: string; kind: 'replace' | 'rows' | 'metadata'; ids: string[] }

export type CollectionSyncSource = {
  collection: (id: string) => Collection
  metadata: (id: string) => CollectionMetadata
  row: (collectionId: string, rowId: string) => TrackRow | undefined
}

/** Bounded identifiers only: the journal never retains old collections or working copies. */
export class CollectionChanges {
  private readonly session = randomUUID()
  private revision = 0
  private floor = 0
  private changes: Change[] = []
  private retainedIds = 0

  cursor(): StateCursor {
    return { session: this.session, revision: this.revision }
  }

  matchesCursor(cursor: StateCursor | null): boolean {
    return Boolean(cursor && cursor.session === this.session && cursor.revision === this.revision)
  }

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
    order: string[],
    source: CollectionSyncSource,
  ): { cursor: StateCursor; updates: CollectionUpdate[] } {
    const next = this.cursor()
    if (this.matchesCursor(cursor)) return { cursor: next, updates: [] }
    if (
      !cursor ||
      cursor.session !== this.session ||
      cursor.revision < this.floor ||
      cursor.revision > this.revision
    ) {
      return {
        cursor: next,
        updates: order.map((id) => ({ kind: 'replace', collection: source.collection(id) })),
      }
    }
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
    for (const id of order) {
      const group = grouped.get(id)
      if (!group) continue
      if (group.replace) {
        updates.push({ kind: 'replace', collection: source.collection(id) })
      } else {
        const changed: TrackRow[] = []
        for (const rowId of group.ids) {
          const row = source.row(id, rowId)
          if (row) changed.push(row)
        }
        updates.push({
          kind: 'patch',
          id,
          rows: changed,
          ...(group.metadata ? { metadata: source.metadata(id) } : {}),
        })
      }
    }
    return { cursor: next, updates }
  }
}
