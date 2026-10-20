import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import {
  createCollection,
  validateCollection,
  mergeRepairedCollection,
  sourceHash,
} from '../core/collection'
import { metadataMatch, reviewGroup } from '../core/matching'
import {
  workingSchema,
  type Collection,
  type ImportPreview,
  type Job,
  type Settings,
  type TrackRow,
  type Working,
} from '../shared/model'

export class Store {
  private db: DatabaseSync
  private collectionCache = new Map<string, Collection>()
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id), position INTEGER NOT NULL, source TEXT NOT NULL, working TEXT NOT NULL, UNIQUE(collection_id, position));
      CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT NOT NULL, changes TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS source_immutable BEFORE UPDATE OF source,position,collection_id ON entries BEGIN SELECT RAISE(ABORT, 'Source is immutable'); END;`)
    for (const job of this.jobs())
      if (job.state === 'running' || job.state === 'pausing')
        this.putJob({
          ...job,
          state: 'paused',
          autoResume:
            job.kind === 'search' && job.backgroundSearch === true && job.autoResume !== false,
          message: 'Прервано закрытием приложения. Можно продолжить.',
        })
  }
  close(): void {
    this.collectionCache.clear()
    this.db.close()
  }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = action()
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  all(): Collection[] {
    const records = this.db.prepare('SELECT id FROM collections ORDER BY rowid DESC').all() as {
      id: string
    }[]
    const order = this.value<string[]>('collection_order', [])
    const orderMap = new Map<string, number>()
    order.forEach((id, index) => orderMap.set(id, index))

    const sorted = [...records].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999
      if (posA !== posB) return posA - posB
      return 0
    })
    return sorted.map((r) => this.get(r.id))
  }
  reorderCollections(ids: string[]): void {
    this.setValue('collection_order', ids)
  }
  renameCollection(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Название коллекции не может быть пустым.')
    const data = this.db.prepare('SELECT metadata FROM collections WHERE id=?').get(id) as
      { metadata: string } | undefined
    if (!data) throw new Error('Коллекция не найдена.')
    const meta = JSON.parse(data.metadata)
    meta.name = trimmed
    this.db.prepare('UPDATE collections SET metadata=? WHERE id=?').run(JSON.stringify(meta), id)
    this.collectionCache.delete(id)
  }
  deleteCollection(id: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM history WHERE collection_id=?').run(id)
      this.db.prepare('DELETE FROM entries WHERE collection_id=?').run(id)
      this.db.prepare('DELETE FROM collections WHERE id=?').run(id)
      const order = this.value<string[]>('collection_order', [])
      if (order.includes(id)) {
        this.setValue(
          'collection_order',
          order.filter((x) => x !== id),
        )
      }
    })
    this.collectionCache.delete(id)
  }
  repairCollection(
    collectionId: string,
    preview: ImportPreview,
  ): { preservedCount: number; addedCount: number; totalCount: number } {
    return this.transaction(() => {
      const existing = this.get(collectionId)
      const {
        rows: mergedRows,
        preservedCount,
        addedCount,
      } = mergeRepairedCollection(existing, preview)

      this.db.prepare('DELETE FROM entries WHERE collection_id=?').run(collectionId)

      const insert = this.db.prepare(
        'INSERT INTO entries(id,collection_id,position,source,working) VALUES(?,?,?,?,?)',
      )
      for (const row of mergedRows) {
        insert.run(
          row.id,
          collectionId,
          row.position,
          JSON.stringify(row.source),
          JSON.stringify(row.working),
        )
      }

      const existingData = this.db
        .prepare('SELECT metadata FROM collections WHERE id=?')
        .get(collectionId) as { metadata: string } | undefined
      if (!existingData) throw new Error('Коллекция не найдена.')

      const existingMeta = JSON.parse(existingData.metadata)
      const updatedMeta = {
        ...existingMeta,
        completeness: preview.completeness,
        sourceHash: sourceHash(mergedRows),
        importedAt: new Date().toISOString(),
      }
      this.db
        .prepare('UPDATE collections SET metadata=? WHERE id=?')
        .run(JSON.stringify(updatedMeta), collectionId)

      this.db.prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)').run(
        collectionId,
        JSON.stringify([
          {
            kind: 'repair',
            total: mergedRows.length,
            preserved: preservedCount,
            added: addedCount,
          },
        ]),
        new Date().toISOString(),
      )

      this.collectionCache.delete(collectionId)

      return {
        preservedCount,
        addedCount,
        totalCount: mergedRows.length,
      }
    })
  }
  get(id: string): Collection {
    const cached = this.collectionCache.get(id)
    if (cached) return cached
    const data = this.db.prepare('SELECT metadata FROM collections WHERE id=?').get(id) as
      { metadata: string } | undefined
    if (!data) throw new Error('Коллекция не найдена.')
    const entries = this.db
      .prepare('SELECT * FROM entries WHERE collection_id=? ORDER BY position')
      .all(id) as { id: string; position: number; source: string; working: string }[]
    const collection: Collection = {
      ...JSON.parse(data.metadata),
      rows: entries.map((r) => ({
        id: r.id,
        position: r.position,
        source: JSON.parse(r.source),
        working: JSON.parse(r.working),
      })),
    }
    this.collectionCache.set(id, collection)
    return collection
  }
  import(preview: ImportPreview): string {
    const collection = createCollection(preview)
    validateCollection(collection)
    if (this.db.prepare('SELECT id FROM collections WHERE id=?').get(collection.id))
      throw new Error('Этот архив уже есть в библиотеке. Повторное восстановление не требуется.')
    const insert = this.db.prepare(
      'INSERT INTO entries(id,collection_id,position,source,working) VALUES(?,?,?,?,?)',
    )
    this.transaction(() => {
      const { rows, ...metadata } = collection
      this.db
        .prepare('INSERT INTO collections(id,metadata) VALUES(?,?)')
        .run(collection.id, JSON.stringify(metadata))
      for (const row of rows)
        insert.run(
          row.id,
          collection.id,
          row.position,
          JSON.stringify(row.source),
          JSON.stringify(row.working),
        )
      const currentOrder = this.value<string[]>('collection_order', [])
      this.setValue('collection_order', [
        collection.id,
        ...currentOrder.filter((x) => x !== collection.id),
      ])
    })
    this.collectionCache.delete(collection.id)
    return collection.id
  }
  row(collectionId: string, id: string): TrackRow {
    const cached = this.collectionCache.get(collectionId)
    if (cached) {
      const found = cached.rows.find((r) => r.id === id)
      if (found) return found
    }
    const row = this.db
      .prepare('SELECT id,position,source,working FROM entries WHERE id=? AND collection_id=?')
      .get(id, collectionId) as
      { id: string; position: number; source: string; working: string } | undefined
    if (!row) throw new Error('Запись не найдена в коллекции.')
    return {
      id: row.id,
      position: row.position,
      source: JSON.parse(row.source),
      working: JSON.parse(row.working),
    }
  }
  confirmMetadataMatches(collectionId: string, ids: string[]): number {
    return this.transaction(() => {
      this.collectionCache.delete(collectionId)
      const changes: { id: string; before: Working }[] = []
      const update = this.db.prepare('UPDATE entries SET working=? WHERE id=? AND collection_id=?')
      const rules = this.settings().matchingRules
      for (const id of new Set(ids)) {
        const row = this.row(collectionId, id)
        const candidate = metadataMatch(row, rules)
        if (reviewGroup(row, rules) !== 'exact' || !candidate)
          throw new Error(`Запись №${row.position} требует отдельной проверки.`)
        changes.push({ id, before: row.working })
        update.run(
          JSON.stringify({ ...row.working, spotify: candidate, destination: 'spotify' }),
          id,
          collectionId,
        )
      }
      if (changes.length)
        this.db
          .prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)')
          .run(collectionId, JSON.stringify(changes), new Date().toISOString())
      return changes.length
    })
  }
  patch(collectionId: string, ids: string[], patch: Partial<Working>, history = true): void {
    const changes: { id: string; before: Working }[] = []
    const pendingUpdates: { row: TrackRow; after: Working }[] = []
    const cached = this.collectionCache.get(collectionId)
    const cachedRowMap = cached ? new Map(cached.rows.map((r) => [r.id, r])) : null

    try {
      this.transaction(() => {
        const select = this.db.prepare('SELECT working FROM entries WHERE id=? AND collection_id=?')
        const update = this.db.prepare(
          'UPDATE entries SET working=? WHERE id=? AND collection_id=?',
        )

        for (const id of new Set(ids)) {
          const row = select.get(id, collectionId) as { working: string } | undefined
          if (!row) throw new Error('Запись не найдена в коллекции.')
          const before = workingSchema.parse(JSON.parse(row.working))
          const after = workingSchema.parse({ ...before, ...patch })
          if (
            (patch.artist !== undefined && patch.artist !== before.artist) ||
            (patch.title !== undefined && patch.title !== before.title) ||
            (patch.version !== undefined && patch.version !== before.version)
          ) {
            if (patch.spotify === undefined) {
              after.spotify = null
              after.candidates = []
              after.searchedQuery = null
              if (after.destination === 'spotify') after.destination = 'unresolved'
            }
          }
          if (after.destination === 'spotify' && !after.spotify)
            throw new Error('Для Spotify нужно подтверждённое совпадение.')
          if (after.destination === 'local' && !after.local)
            throw new Error('Для локального переноса нужен файл.')
          if (after.destination !== 'unresolved') {
            after.localPending = false
            after.reviewDeferred = false
          }
          changes.push({ id, before })
          update.run(JSON.stringify(after), id, collectionId)
          if (cachedRowMap) {
            const cachedRow = cachedRowMap.get(id)
            if (cachedRow) {
              pendingUpdates.push({ row: cachedRow, after })
            }
          }
        }
        if (history && changes.length)
          this.db
            .prepare('INSERT INTO history(collection_id,changes,at) VALUES(?,?,?)')
            .run(collectionId, JSON.stringify(changes), new Date().toISOString())
      })
      for (const item of pendingUpdates) {
        item.row.working = item.after
      }
    } catch (err) {
      this.collectionCache.delete(collectionId)
      throw err
    }
  }
  undo(collectionId: string): boolean {
    this.collectionCache.delete(collectionId)
    return this.transaction(() => {
      const item = this.db
        .prepare('SELECT id,changes FROM history WHERE collection_id=? ORDER BY id DESC LIMIT 1')
        .get(collectionId) as { id: number; changes: string } | undefined
      if (!item) return false
      for (const change of JSON.parse(item.changes) as { id: string; before: Working }[])
        this.db
          .prepare('UPDATE entries SET working=? WHERE id=? AND collection_id=?')
          .run(JSON.stringify(change.before), change.id, collectionId)
      this.db.prepare('DELETE FROM history WHERE id=?').run(item.id)
      return true
    })
  }
  settings(): Settings {
    return {
      clientId: '',
      spotifyProxy: '',
      useProxyForVK: false,
      vkProxy: '',
      matchingRules: {
        diacritics: true,
        homoglyphs: true,
        featDeduplication: true,
        identicalVersions: true,
        remixPunctuation: true,
        extendedDurationTolerance: true,
      },
      playlistName: 'Вся музыка из VK',
      searchDelayMs: 5000,
      autoResumeSearch: true,
      searchProvider: 'browser',
      theme: 'light',
      ...this.value('preferences', {}),
    }
  }
  value<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  }
  setValue(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
  cached<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM cache WHERE key=?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : null
  }
  cache(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO cache(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
  jobs(): Job[] {
    return (
      this.db.prepare('SELECT payload FROM jobs ORDER BY rowid DESC').all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload) as Job)
  }
  job(id: string): Job {
    const job = this.jobs().find((j) => j.id === id)
    if (!job) throw new Error('Задание не найдено.')
    return job
  }
  archiveJob(id: string): void {
    this.db.prepare('DELETE FROM jobs WHERE id=?').run(id)
  }
  archiveFinishedJobs(): number {
    const finished = this.jobs().filter((j) => j.state === 'complete' || j.state === 'failed')
    if (finished.length === 0) return 0
    const del = this.db.prepare('DELETE FROM jobs WHERE id=?')
    this.transaction(() => {
      for (const j of finished) {
        del.run(j.id)
      }
    })
    return finished.length
  }
  putJob(job: Job): void {
    job.updatedAt = new Date().toISOString()
    this.db
      .prepare(
        'INSERT INTO jobs(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(job.id, JSON.stringify(job))
  }
  newJob(collectionId: string, kind: Job['kind'], rowIds: string[]): Job {
    const job: Job = {
      id: randomUUID(),
      collectionId,
      kind,
      rowIds,
      state: 'paused',
      cursor: 0,
      total: rowIds.length,
      message: 'Готово к запуску.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.putJob(job)
    return job
  }
}
