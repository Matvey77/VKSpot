import {
  createCollection,
  validateCollection,
  mergeRepairedCollection,
  sourceHash,
} from '../../core/collection'
import { metadataMatch, searchText } from '../../core/matching'
import {
  workingSchema,
  type Collection,
  type ImportPreview,
  type TrackRow,
  type Working,
} from '../../shared/model'
import { formatRecordsCount } from '../../shared/ru'
import type { CollectionMetadata, StateCursor } from '../../shared/sync'
import { CollectionChanges } from './collection-changes'
import type { Database } from './database'
import type { Preferences } from './preferences'

const MAX_HISTORY_PER_COLLECTION = 100
const MAX_REPAIR_HISTORY_PER_COLLECTION = 5

type CachedCollection = { collection: Collection; rows: Map<string, TrackRow>; rowsDirty: boolean }
type WorkingUpdate = { id: string; after: Working }
type WorkingChange = WorkingUpdate & { before: Working }
type RepairHistory = { kind: 'repair'; collection: Collection }
export type WorkingPatchItem = { id: string; patch: Partial<Working> }

export class CollectionRepository {
  private cache = new Map<string, CachedCollection>()
  private cachedOrder: string[] | null = null
  private changes = new CollectionChanges()

  constructor(
    private db: Database,
    private preferences: Preferences,
  ) {}

  private order(): string[] {
    if (this.cachedOrder) return this.cachedOrder.slice()
    const ids = this.db.prepare('SELECT id FROM collections ORDER BY rowid DESC').all() as {
      id: string
    }[]
    const order = new Map(
      this.preferences.value<string[]>('collection_order', []).map((id, index) => [id, index]),
    )
    this.cachedOrder = ids
      .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
      .map(({ id }) => id)
    return this.cachedOrder.slice()
  }

  all(): Collection[] {
    return this.order().map((id) => this.get(id))
  }

  sync(cursor: StateCursor | null) {
    if (this.changes.matchesCursor(cursor)) {
      return {
        cursor: this.changes.cursor(),
        order: this.order(),
        updates: [],
      }
    }
    const order = this.order()
    return {
      ...this.changes.since(cursor, order, {
        collection: (id) => this.get(id),
        metadata: (id) => this.metadataOf(this.ensureCached(id).collection),
        row: (collectionId, rowId) => this.ensureCached(collectionId).rows.get(rowId),
      }),
      order,
    }
  }

  private metadataOf(collection: Collection): CollectionMetadata {
    const { rows: _rows, ...metadata } = collection
    return metadata
  }

  private remember(collection: Collection): Collection {
    this.cache.set(collection.id, {
      collection,
      rows: new Map(collection.rows.map((row) => [row.id, row])),
      rowsDirty: false,
    })
    return collection
  }

  private ensureCached(id: string): CachedCollection {
    const cached = this.cache.get(id)
    if (cached) return cached
    const record = this.db.prepare('SELECT metadata FROM collections WHERE id=?').get(id) as
      { metadata: string } | undefined
    if (!record) throw new Error('Коллекция не найдена.')
    const entries = this.db
      .prepare(
        'SELECT id,position,source,working FROM entries WHERE collection_id=? ORDER BY position',
      )
      .all(id) as { id: string; position: number; source: string; working: string }[]
    this.remember({
      ...JSON.parse(record.metadata),
      rows: entries.map((row) => ({
        id: row.id,
        position: row.position,
        source: JSON.parse(row.source),
        working: JSON.parse(row.working),
      })),
    })
    return this.cache.get(id)!
  }

  private materialize(cached: CachedCollection): Collection {
    if (cached.rowsDirty) {
      cached.collection = {
        ...cached.collection,
        rows: [...cached.rows.values()],
      }
      cached.rowsDirty = false
    }
    return cached.collection
  }

  get(id: string): Collection {
    return this.materialize(this.ensureCached(id))
  }

  row(collectionId: string, id: string): TrackRow {
    const row = this.ensureCached(collectionId).rows.get(id)
    if (!row) throw new Error('Запись не найдена в коллекции.')
    return row
  }

  private insertRows(collectionId: string, rows: TrackRow[]): void {
    const insert = this.db.prepare(
      'INSERT INTO entries(id,collection_id,position,source,working) VALUES(?,?,?,?,?)',
    )
    for (const row of rows)
      insert.run(
        row.id,
        collectionId,
        row.position,
        JSON.stringify(row.source),
        JSON.stringify(row.working),
      )
  }

  import(preview: ImportPreview): string {
    const collection = createCollection(preview)
    validateCollection(collection)
    if (this.db.prepare('SELECT id FROM collections WHERE id=?').get(collection.id))
      throw new Error('Этот архив уже есть в коллекциях. Повторное восстановление не требуется.')
    this.db.transaction(() => {
      const { rows, ...metadata } = collection
      this.db
        .prepare('INSERT INTO collections(id,metadata) VALUES(?,?)')
        .run(collection.id, JSON.stringify(metadata))
      this.insertRows(collection.id, rows)
      this.preferences.setValue('collection_order', [
        collection.id,
        ...this.preferences
          .value<string[]>('collection_order', [])
          .filter((id) => id !== collection.id),
      ])
    })
    this.remember(collection)
    this.cachedOrder = null
    this.changes.record(collection.id, 'replace')
    return collection.id
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Название коллекции не может быть пустым.')
    const cached = this.ensureCached(id)
    const next = { ...cached.collection, name: trimmed }
    this.saveMetadata(next)
    cached.collection = next
    this.changes.record(id, 'metadata')
  }

  reorder(ids: string[]): void {
    const existing = this.order()
    if (
      ids.length !== existing.length ||
      new Set(ids).size !== existing.length ||
      ids.some((id) => !existing.includes(id))
    )
      throw new Error('Порядок должен содержать все коллекции ровно один раз.')
    this.preferences.setValue('collection_order', ids)
    this.cachedOrder = [...ids]
    this.changes.record('', 'metadata')
  }

  remove(id: string): void {
    this.ensureCached(id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM history WHERE collection_id=?').run(id)
      this.db.prepare('DELETE FROM entries WHERE collection_id=?').run(id)
      this.db.prepare('DELETE FROM collections WHERE id=?').run(id)
      this.db.prepare("DELETE FROM jobs WHERE json_extract(payload,'$.collectionId')=?").run(id)
      this.preferences.setValue(
        'collection_order',
        this.preferences.value<string[]>('collection_order', []).filter((value) => value !== id),
      )
    })
    this.cache.delete(id)
    this.cachedOrder = null
    this.changes.record(id, 'replace')
  }

  private saveMetadata(collection: Collection): void {
    this.db
      .prepare('UPDATE collections SET metadata=? WHERE id=?')
      .run(JSON.stringify(this.metadataOf(collection)), collection.id)
  }

  private trimHistory(collectionId: string, limitRepairs: boolean): void {
    if (limitRepairs) {
      this.db
        .prepare(
          `DELETE FROM history
           WHERE collection_id=?
             AND changes LIKE '{"kind":"repair",%'
             AND id NOT IN (
               SELECT id FROM history
               WHERE collection_id=? AND changes LIKE '{"kind":"repair",%'
               ORDER BY id DESC
               LIMIT ?
             )`,
        )
        .run(collectionId, collectionId, MAX_REPAIR_HISTORY_PER_COLLECTION)
    }
    this.db
      .prepare(
        `DELETE FROM history
         WHERE collection_id=?
           AND id NOT IN (
             SELECT id FROM history
             WHERE collection_id=?
             ORDER BY id DESC
             LIMIT ?
           )`,
      )
      .run(collectionId, collectionId, MAX_HISTORY_PER_COLLECTION)
  }

  repair(
    id: string,
    preview: ImportPreview,
  ): { preservedCount: number; addedCount: number; totalCount: number } {
    const existing = this.get(id)
    const { rows, preservedCount, addedCount } = mergeRepairedCollection(existing, preview)
    const completeness = preview.range ? existing.completeness : preview.completeness
    const expectedLength = preview.range ? existing.rows.length : preview.tracks.length
    const collection = {
      ...existing,
      rows,
      completeness:
        rows.length === expectedLength
          ? completeness
          : {
              ...completeness,
              status: 'unverified' as const,
              message: `${completeness.message} После сохранения прежних решений в коллекции ${formatRecordsCount(rows.length)}. Сверь состав с VK.`,
            },
      sourceHash: sourceHash(rows),
      importedAt: new Date().toISOString(),
    }
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM entries WHERE collection_id=?').run(id)
      this.insertRows(id, rows)
      this.saveMetadata(collection)
      this.db
        .prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)')
        .run(
          id,
          JSON.stringify({ kind: 'repair', collection: existing } satisfies RepairHistory),
          new Date().toISOString(),
        )
      this.trimHistory(id, true)
    })
    this.remember(collection)
    this.changes.record(id, 'replace')
    return { preservedCount, addedCount, totalCount: rows.length }
  }

  private commitWorking(collectionId: string, changes: WorkingChange[], history: boolean): void {
    if (!changes.length) return
    this.db.transaction(() => {
      this.writeWorkingRows(collectionId, changes)
      if (history) {
        this.db
          .prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)')
          .run(
            collectionId,
            JSON.stringify(changes.map(({ id, before }) => ({ id, before }))),
            new Date().toISOString(),
          )
        this.trimHistory(collectionId, false)
      }
    })
    this.publishWorkingRows(collectionId, changes)
  }

  private writeWorkingRows(collectionId: string, changes: WorkingUpdate[]): void {
    const update = this.db.prepare('UPDATE entries SET working=? WHERE id=? AND collection_id=?')
    for (const { id, after } of changes) update.run(JSON.stringify(after), id, collectionId)
  }

  private publishWorkingRows(collectionId: string, changes: WorkingUpdate[]): void {
    const cached = this.cache.get(collectionId)!
    for (const change of changes) {
      const previous = cached.rows.get(change.id)!
      cached.rows.set(change.id, { ...previous, working: change.after })
    }
    cached.rowsDirty = true
    this.changes.record(
      collectionId,
      'rows',
      changes.map((change) => change.id),
    )
  }

  private applyWorkingPatch(before: Working, patch: Partial<Working>): Working {
    const after = workingSchema.parse({ ...before, ...patch })
    const metadataChanged = (['artist', 'title', 'version'] as const).some(
      (key) => patch[key] !== undefined && patch[key] !== before[key],
    )
    if (metadataChanged && patch.spotify === undefined) {
      after.spotify = null
      after.candidates = []
      after.searchedQuery = null
      if (after.destination === 'spotify') after.destination = 'unresolved'
    }
    if (after.destination === 'spotify' && !after.spotify)
      throw new Error('Для Spotify нужно подтверждённое совпадение.')
    if (after.destination === 'local' && !after.local)
      throw new Error('Для локального переноса нужен файл.')
    if (after.destination !== 'unresolved') {
      after.localPending = false
      after.reviewDeferred = false
    }
    return after
  }

  patch(collectionId: string, ids: string[], patch: Partial<Working>, history = true): void {
    const changes: WorkingChange[] = []
    // Validate the whole batch before changing either the database or its cache.
    for (const id of new Set(ids)) {
      const before = this.row(collectionId, id).working
      changes.push({ id, before, after: this.applyWorkingPatch(before, patch) })
    }
    this.commitWorking(collectionId, changes, history)
  }

  patchMany(collectionId: string, updates: WorkingPatchItem[], history = false): void {
    if (!updates.length) return
    const byId = new Map<string, WorkingChange>()
    for (const item of updates) {
      const existing = byId.get(item.id)
      const before = existing ? existing.after : this.row(collectionId, item.id).working
      const after = this.applyWorkingPatch(before, item.patch)
      byId.set(item.id, {
        id: item.id,
        before: existing ? existing.before : before,
        after,
      })
    }
    this.commitWorking(collectionId, [...byId.values()], history)
  }

  confirm(collectionId: string, ids: string[]): number {
    const rules = this.preferences.settings().matchingRules
    const changes = [...new Set(ids)].map((id) => {
      const row = this.row(collectionId, id)
      const working = row.working
      const searched =
        working.searchedQuery === searchText(working) ||
        (working.searchedQuery === null && working.candidates.length > 0)
      const eligible =
        !working.excluded &&
        working.destination === 'unresolved' &&
        !working.localPending &&
        !working.reviewDeferred &&
        searched &&
        working.candidates.length > 0
      const candidate = eligible ? metadataMatch(row, rules) : null
      if (!candidate) throw new Error(`Запись №${row.position} требует отдельной проверки.`)
      return {
        id,
        before: working,
        after: {
          ...working,
          spotify: candidate,
          destination: 'spotify' as const,
          localPending: false,
          reviewDeferred: false,
        },
      }
    })
    this.commitWorking(collectionId, changes, true)
    return changes.length
  }

  undo(collectionId: string): boolean {
    const item = this.db
      .prepare('SELECT id,changes FROM history WHERE collection_id=? ORDER BY id DESC LIMIT 1')
      .get(collectionId) as { id: number; changes: string } | undefined
    if (!item) return false
    const history = JSON.parse(item.changes) as { id: string; before: Working }[] | RepairHistory
    if (!Array.isArray(history)) {
      if (history.kind !== 'repair' || !history.collection)
        throw new Error(
          'Эта старая операция синхронизации не содержит снимка для отмены. Восстанови сохранённый архив.',
        )
      validateCollection(history.collection)
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM entries WHERE collection_id=?').run(collectionId)
        this.insertRows(collectionId, history.collection.rows)
        this.saveMetadata(history.collection)
        this.db.prepare('DELETE FROM history WHERE id=?').run(item.id)
      })
      this.remember(history.collection)
      this.changes.record(collectionId, 'replace')
    } else {
      // Older repair records used an array without before/id. Never apply them as row edits.
      if (history.some((change) => !change.id || !change.before))
        throw new Error('Эту старую синхронизацию можно отменить только восстановлением архива.')
      const changes = history.map(({ id, before }) => {
        this.row(collectionId, id)
        return { id, after: workingSchema.parse(before) }
      })
      this.db.transaction(() => {
        this.writeWorkingRows(collectionId, changes)
        this.db.prepare('DELETE FROM history WHERE id=?').run(item.id)
      })
      this.publishWorkingRows(collectionId, changes)
    }
    return true
  }
}
