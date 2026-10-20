import {
  createCollection,
  validateCollection,
  mergeRepairedCollection,
  sourceHash,
} from '../../core/collection'
import { metadataMatch, reviewGroup } from '../../core/matching'
import {
  workingSchema,
  type Collection,
  type ImportPreview,
  type TrackRow,
  type Working,
} from '../../shared/model'
import type { StateCursor } from '../../shared/sync'
import { CollectionChanges } from './collection-changes'
import type { Database } from './database'
import type { Preferences } from './preferences'

type CachedCollection = { collection: Collection; rows: Map<string, TrackRow> }
type WorkingChange = { id: string; before: Working; after: Working }
type RepairHistory = { kind: 'repair'; collection: Collection }

export class CollectionRepository {
  private cache = new Map<string, CachedCollection>()
  private changes = new CollectionChanges()

  constructor(
    private db: Database,
    private preferences: Preferences,
  ) {}

  all(): Collection[] {
    const ids = this.db.prepare('SELECT id FROM collections ORDER BY rowid DESC').all() as {
      id: string
    }[]
    const order = new Map(
      this.preferences.value<string[]>('collection_order', []).map((id, index) => [id, index]),
    )
    return ids
      .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
      .map(({ id }) => this.get(id))
  }

  sync(cursor: StateCursor | null) {
    const collections = this.all()
    return {
      ...this.changes.since(cursor, collections),
      order: collections.map((collection) => collection.id),
    }
  }

  private remember(collection: Collection): Collection {
    this.cache.set(collection.id, {
      collection,
      rows: new Map(collection.rows.map((row) => [row.id, row])),
    })
    return collection
  }

  get(id: string): Collection {
    const cached = this.cache.get(id)
    if (cached) return cached.collection
    const record = this.db.prepare('SELECT metadata FROM collections WHERE id=?').get(id) as
      { metadata: string } | undefined
    if (!record) throw new Error('Коллекция не найдена.')
    const entries = this.db
      .prepare(
        'SELECT id,position,source,working FROM entries WHERE collection_id=? ORDER BY position',
      )
      .all(id) as { id: string; position: number; source: string; working: string }[]
    return this.remember({
      ...JSON.parse(record.metadata),
      rows: entries.map((row) => ({
        id: row.id,
        position: row.position,
        source: JSON.parse(row.source),
        working: JSON.parse(row.working),
      })),
    })
  }

  row(collectionId: string, id: string): TrackRow {
    this.get(collectionId)
    const row = this.cache.get(collectionId)!.rows.get(id)
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
      throw new Error('Этот архив уже есть в библиотеке. Повторное восстановление не требуется.')
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
    this.changes.record(collection.id, 'replace')
    return collection.id
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Название коллекции не может быть пустым.')
    const collection = { ...this.get(id), name: trimmed }
    const { rows: _rows, ...metadata } = collection
    this.db
      .prepare('UPDATE collections SET metadata=? WHERE id=?')
      .run(JSON.stringify(metadata), id)
    this.cache.get(id)!.collection = collection
    this.changes.record(id, 'metadata')
  }

  reorder(ids: string[]): void {
    const existing = this.all().map((collection) => collection.id)
    if (
      ids.length !== existing.length ||
      new Set(ids).size !== existing.length ||
      ids.some((id) => !existing.includes(id))
    )
      throw new Error('Порядок должен содержать все коллекции ровно один раз.')
    this.preferences.setValue('collection_order', ids)
    this.changes.record('', 'metadata')
  }

  remove(id: string): void {
    this.get(id)
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
    this.changes.record(id, 'replace')
  }

  private saveMetadata(collection: Collection): void {
    const { rows: _rows, ...metadata } = collection
    this.db
      .prepare('UPDATE collections SET metadata=? WHERE id=?')
      .run(JSON.stringify(metadata), collection.id)
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
              message: `${completeness.message} После сохранения прежних решений в коллекции ${rows.length} записей. Сверьте состав с VK.`,
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
    })
    this.remember(collection)
    this.changes.record(id, 'replace')
    return { preservedCount, addedCount, totalCount: rows.length }
  }

  private commitWorking(collectionId: string, changes: WorkingChange[], history: boolean): void {
    if (!changes.length) return
    this.db.transaction(() => {
      const update = this.db.prepare('UPDATE entries SET working=? WHERE id=? AND collection_id=?')
      for (const change of changes)
        update.run(JSON.stringify(change.after), change.id, collectionId)
      if (history)
        this.db
          .prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)')
          .run(
            collectionId,
            JSON.stringify(changes.map(({ id, before }) => ({ id, before }))),
            new Date().toISOString(),
          )
    })
    const cached = this.cache.get(collectionId)!
    const nextRows = cached.collection.rows.slice()
    for (const change of changes) {
      const previous = cached.rows.get(change.id)!
      const next = { ...previous, working: change.after }
      cached.rows.set(change.id, next)
      // Positions are contiguous and immutable between imports/repairs.
      nextRows[previous.position - 1] = next
    }
    cached.collection = { ...cached.collection, rows: nextRows }
    this.changes.record(
      collectionId,
      'rows',
      changes.map((change) => change.id),
    )
  }

  patch(collectionId: string, ids: string[], patch: Partial<Working>, history = true): void {
    const changes: WorkingChange[] = []
    // Validate the whole batch before changing either the database or its cache.
    for (const id of new Set(ids)) {
      const before = this.row(collectionId, id).working
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
      changes.push({ id, before, after })
    }
    this.commitWorking(collectionId, changes, history)
  }

  confirm(collectionId: string, ids: string[]): number {
    const rules = this.preferences.settings().matchingRules
    const changes = [...new Set(ids)].map((id) => {
      const row = this.row(collectionId, id)
      const candidate = metadataMatch(row, rules)
      if (reviewGroup(row, rules) !== 'exact' || !candidate)
        throw new Error(`Запись №${row.position} требует отдельной проверки.`)
      return {
        id,
        before: row.working,
        after: {
          ...row.working,
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
          'Эта старая операция синхронизации не содержит снимок для отмены. Восстановите сохранённый архив.',
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
      const changes = history.map((change) => ({
        id: change.id,
        before: this.row(collectionId, change.id).working,
        after: workingSchema.parse(change.before),
      }))
      this.db.transaction(() => {
        const update = this.db.prepare(
          'UPDATE entries SET working=? WHERE id=? AND collection_id=?',
        )
        for (const change of changes)
          update.run(JSON.stringify(change.after), change.id, collectionId)
        this.db.prepare('DELETE FROM history WHERE id=?').run(item.id)
      })
      // Reuse the same cache update path after the durable transaction succeeds.
      const cached = this.cache.get(collectionId)!
      const nextRows = cached.collection.rows.slice()
      for (const change of changes) {
        const row = cached.rows.get(change.id)!
        const next = { ...row, working: change.after }
        cached.rows.set(change.id, next)
        nextRows[row.position - 1] = next
      }
      cached.collection = { ...cached.collection, rows: nextRows }
      this.changes.record(
        collectionId,
        'rows',
        changes.map((change) => change.id),
      )
    }
    return true
  }
}
