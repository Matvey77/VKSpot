import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '../../src/main/storage'
import { Database } from '../../src/main/storage/database'
import {
  EMPTY_CACHE_TTL_MS,
  FULL_CACHE_TTL_MS,
  Preferences,
} from '../../src/main/storage/preferences'
import { parseImport, exportText } from '../../src/core/collection'
import { workingPatchSchema } from '../../src/shared/model'

function cleanupTempDir(directory: string): void {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-store-')
  ) {
    throw new Error('Unsafe cleanup target')
  }
  rmSync(directory, { recursive: true, force: true })
}

describe('transactional collection storage', () => {
  it('partial IPC commands retain local links, notes, versions and destination', () => {
    const patch = workingPatchSchema.parse({ excluded: true })
    expect(patch).toEqual({ excluded: true })
    expect(workingPatchSchema.parse({ spotify: null })).toEqual({ spotify: null })
    expect(() => workingPatchSchema.parse({ position: 1 })).toThrow()
  })
  it('keeps original and repeated occurrences through edits and undo', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - Remix\nA - Remix', '.txt', 'Test')),
        first = store.get(id).rows[0]
      store.patch(id, [first.id], { artist: 'Correct A', title: 'Correct Remix', excluded: true })
      const edited = store.get(id)
      expect(edited.rows[0].source.artist).toBe('A')
      expect(edited.rows).toHaveLength(2)
      expect(edited.rows[0].working.excluded).toBe(true)
      expect(store.undo(id)).toBe(true)
      expect(store.get(id).rows[0].working.title).toBe('Remix')
      expect(store.undo(id)).toBe(false)
      expect(() =>
        store.import(parseImport(exportText(store.get(id), 'archive'), '.json', 'Test')),
      ).toThrow('уже')
    } finally {
      store.close()
    }
  })
  it('rolls back a bulk change if any occurrence is invalid', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Test')),
        row = store.get(id).rows[0]
      expect(() => store.patch(id, [row.id, 'missing'], { excluded: true })).toThrow()
      expect(store.get(id).rows[0].working.excluded).toBe(false)
      expect(store.undo(id)).toBe(false)
    } finally {
      store.close()
    }
  })
  it('invalidates a reviewed match after description changes', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Test')),
        row = store.get(id).rows[0]
      store.patch(id, [row.id], {
        spotify: {
          uri: 'spotify:track:' + 'a'.repeat(22),
          title: 'B',
          artists: ['A'],
          album: '',
          duration: 200,
          url: '',
        },
        destination: 'spotify',
      })
      store.patch(id, [row.id], { title: 'B Remix' })
      expect(store.get(id).rows[0].working.spotify).toBeNull()
      expect(store.get(id).rows[0].working.destination).toBe('unresolved')
    } finally {
      store.close()
    }
  })
  it('resets decisions on multiple tracks back to unresolved and supports undo', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(
        parseImport('Artist 1 - Song 1\nArtist 2 - Song 2\nArtist 3 - Song 3', '.txt', 'Test'),
      )
      const [r1, r2, r3] = store.get(id).rows
      store.patch(id, [r1.id], { localPending: true })
      store.patch(id, [r2.id], { reviewDeferred: true })
      store.patch(id, [r3.id], { excluded: true })

      expect(store.get(id).rows[0].working.localPending).toBe(true)
      expect(store.get(id).rows[1].working.reviewDeferred).toBe(true)
      expect(store.get(id).rows[2].working.excluded).toBe(true)

      // Batch reset decisions
      store.patch(id, [r1.id, r2.id, r3.id], {
        destination: 'unresolved',
        spotify: null,
        localPending: false,
        reviewDeferred: false,
        local: null,
        excluded: false,
      })

      const afterReset = store.get(id).rows
      for (const row of afterReset) {
        expect(row.working.destination).toBe('unresolved')
        expect(row.working.spotify).toBeNull()
        expect(row.working.localPending).toBe(false)
        expect(row.working.reviewDeferred).toBe(false)
        expect(row.working.local).toBeNull()
        expect(row.working.excluded).toBe(false)
      }

      // Undo restores the previous decisions
      expect(store.undo(id)).toBe(true)
      const afterUndo = store.get(id).rows
      expect(afterUndo[0].working.localPending).toBe(true)
      expect(afterUndo[1].working.reviewDeferred).toBe(true)
      expect(afterUndo[2].working.excluded).toBe(true)
    } finally {
      store.close()
    }
  })
  it('archives individual and finished jobs', () => {
    const store = new Store(':memory:')
    try {
      const job1 = store.newJob('coll-1', 'search', ['r1'])
      const job2 = store.newJob('coll-1', 'search', ['r2'])
      const job3 = store.newJob('coll-1', 'transfer', ['r3'])
      expect(store.jobs()).toHaveLength(3)

      // archive individual job
      store.archiveJob(job1.id)
      expect(store.jobs()).toHaveLength(2)
      expect(store.jobs().some((j) => j.id === job1.id)).toBe(false)

      // mark job2 as complete and job3 as running
      job2.state = 'complete'
      store.putJob(job2)
      job3.state = 'running'
      store.putJob(job3)

      const archivedCount = store.archiveFinishedJobs()
      expect(archivedCount).toBe(1)
      const remaining = store.jobs()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(job3.id)
    } finally {
      store.close()
    }
  })
  it('supports reordering, renaming, deleting, and repairing collections', () => {
    const store = new Store(':memory:')
    try {
      const id1 = store.import(parseImport('Queen - Bohemian Rhapsody', '.txt', 'Collection 1'))
      const id2 = store.import(parseImport('Daft Punk - One More Time', '.txt', 'Collection 2'))
      const id3 = store.import(parseImport('Nirvana - In Bloom', '.txt', 'Collection 3'))

      let collections = store.all()
      expect(collections.map((c) => c.id)).toEqual([id3, id2, id1])

      // Reorder collections: make Collection 2 primary (top)
      store.reorderCollections([id2, id3, id1])
      collections = store.all()
      expect(collections.map((c) => c.id)).toEqual([id2, id3, id1])

      // Rename collection
      store.renameCollection(id2, 'Electro Classics')
      expect(store.get(id2).name).toBe('Electro Classics')

      // Make a decision on Collection 1
      const queenUri = 'spotify:track:' + '1'.repeat(22)
      const row1 = store.get(id1).rows[0]
      store.patch(id1, [row1.id], {
        spotify: {
          uri: queenUri,
          title: 'Bohemian Rhapsody',
          artists: ['Queen'],
          album: 'A Night at the Opera',
          duration: 354,
          url: '',
        },
        destination: 'spotify',
        note: 'Original vinyl master',
      })

      // Repair Collection 1 with a new list containing Queen + a new track
      const repairPreview = parseImport(
        'Queen - Bohemian Rhapsody\nDavid Bowie - Heroes',
        '.txt',
        'Repaired List',
      )
      const repairResult = store.repairCollection(id1, repairPreview)
      expect(repairResult.preservedCount).toBe(1)
      expect(repairResult.addedCount).toBe(1)
      expect(repairResult.totalCount).toBe(2)

      const repaired = store.get(id1)
      expect(repaired.rows).toHaveLength(2)
      expect(repaired.rows[0].working.destination).toBe('spotify')
      expect(repaired.rows[0].working.spotify?.uri).toBe(queenUri)
      expect(repaired.rows[0].working.note).toBe('Original vinyl master')
      expect(repaired.rows[1].working.destination).toBe('unresolved')
      expect(repaired.rows[1].source.title).toBe('Heroes')

      // Delete collection
      store.deleteCollection(id3)
      collections = store.all()
      expect(collections.map((c) => c.id)).toEqual([id2, id1])
      expect(() => store.get(id3)).toThrow()
    } finally {
      store.close()
    }
  })

  it('recovers interrupted transfer without playlistId at cursor 0 as needs-review and others as paused', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vkspot-store-'))
    const dbPath = join(directory, 'collection.db')
    let store = new Store(dbPath)
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Crash'))
      const rowId = store.get(id).rows[0].id

      const ambiguousTransfer = store.newJob(id, 'transfer', [rowId])
      store.putJob({ ...ambiguousTransfer, state: 'running', cursor: 0 })

      const createdTransfer = store.newJob(id, 'transfer', [rowId])
      store.putJob({
        ...createdTransfer,
        state: 'pausing',
        cursor: 0,
        playlistId: 'playlist-123',
      })

      const interruptedSearch = store.newJob(id, 'search', [rowId])
      store.putJob({ ...interruptedSearch, state: 'running', cursor: 0 })

      store.close()
      store = new Store(dbPath)

      expect(store.job(ambiguousTransfer.id)).toMatchObject({
        state: 'needs-review',
        autoResume: false,
      })
      expect(store.job(ambiguousTransfer.id).message).toContain('Spotify')
      expect(store.job(createdTransfer.id)).toMatchObject({ state: 'paused' })
      expect(store.job(interruptedSearch.id)).toMatchObject({ state: 'paused' })
    } finally {
      store.close()
      cleanupTempDir(directory)
    }
  })

  it('supports nested SAVEPOINT transactions, creates history index, and preserves original errors on rollback failure', () => {
    const db = new Database(':memory:')
    try {
      const indexRow = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_history_collection'",
        )
        .get() as { name: string } | undefined
      expect(indexRow?.name).toBe('idx_history_collection')

      db.transaction(() => {
        db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('outer-before', '1')
        expect(() =>
          db.transaction(() => {
            db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('inner-rolled-back', '2')
            throw new Error('inner failure')
          }),
        ).toThrow('inner failure')
        db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('outer-after', '3')
      })

      expect(db.prepare('SELECT value FROM settings WHERE key=?').get('outer-before')).toEqual({
        value: '1',
      })
      expect(
        db.prepare('SELECT value FROM settings WHERE key=?').get('inner-rolled-back'),
      ).toBeUndefined()
      expect(db.prepare('SELECT value FROM settings WHERE key=?').get('outer-after')).toEqual({
        value: '3',
      })

      expect(() =>
        db.transaction(() => {
          db.close()
          throw new Error('original transaction failure')
        }),
      ).toThrow('original transaction failure')
    } finally {
      db.close()
    }
  })

  it('caches settings in memory until preferences change and enforces cache TTL and entry cap', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    const baseTime = 1_700_000_000_000
    nowSpy.mockReturnValue(baseTime)
    const db = new Database(':memory:')
    try {
      const prefs = new Preferences(db, { maxCacheEntries: 3, cachePruneInterval: 1 })
      const firstSettings = prefs.settings()
      expect(prefs.settings()).toBe(firstSettings)

      prefs.setValue('preferences', { ...firstSettings, playlistName: 'Updated List' })
      const updatedSettings = prefs.settings()
      expect(updatedSettings).not.toBe(firstSettings)
      expect(updatedSettings.playlistName).toBe('Updated List')
      expect(prefs.settings()).toBe(updatedSettings)

      prefs.cache('empty-key', [])
      prefs.cache('full-key', [{ uri: 'spotify:track:' + 'a'.repeat(22) }])
      expect(prefs.cached('empty-key')).toEqual([])
      expect(prefs.cached('full-key')).toHaveLength(1)

      nowSpy.mockReturnValue(baseTime + EMPTY_CACHE_TTL_MS)
      expect(prefs.cached('empty-key')).toBeNull()
      expect(prefs.cached('full-key')).toHaveLength(1)

      nowSpy.mockReturnValue(baseTime + FULL_CACHE_TTL_MS)
      expect(prefs.cached('full-key')).toBeNull()

      nowSpy.mockReturnValue(baseTime + FULL_CACHE_TTL_MS + 1000)
      prefs.cache('k1', [{ id: 1 }])
      nowSpy.mockReturnValue(baseTime + FULL_CACHE_TTL_MS + 2000)
      prefs.cache('k2', [{ id: 2 }])
      nowSpy.mockReturnValue(baseTime + FULL_CACHE_TTL_MS + 3000)
      prefs.cache('k3', [{ id: 3 }])
      nowSpy.mockReturnValue(baseTime + FULL_CACHE_TTL_MS + 4000)
      prefs.cache('k4', [{ id: 4 }])

      expect(prefs.cached('k1')).toBeNull()
      expect(prefs.cached('k2')).toEqual([{ id: 2 }])
      expect(prefs.cached('k3')).toEqual([{ id: 3 }])
      expect(prefs.cached('k4')).toEqual([{ id: 4 }])
    } finally {
      nowSpy.mockRestore()
      db.close()
    }
  })

  it('bounds collection history to 100 entries and 5 repair snapshots', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('Artist - Track', '.txt', 'HistoryCap'))
      const rowId = store.get(id).rows[0].id

      for (let i = 1; i <= 105; i++) {
        store.patch(id, [rowId], { note: `n-${i}` })
      }

      let undoCount = 0
      while (store.undo(id)) undoCount++
      expect(undoCount).toBe(100)
      expect(store.row(id, rowId).working.note).toBe('n-5')

      for (let r = 1; r <= 7; r++) {
        store.repairCollection(id, parseImport(`Artist - Track\nExtra - ${r}`, '.txt', `R${r}`))
      }
      let repairUndos = 0
      while (store.undo(id)) repairUndos++
      expect(repairUndos).toBe(5)
    } finally {
      store.close()
    }
  })

  it('detects in-place rowIds mutation in putJob and skips job_details in putJobProgress', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - B', '.txt', 'Jobs'))
      const job = store.newJob(id, 'search', ['row-1'])
      const hydrated = store.job(job.id)
      hydrated.rowIds.push('row-2')
      store.putJob(hydrated)
      expect(store.job(job.id).rowIds).toEqual(['row-1', 'row-2'])

      hydrated.cursor = 1
      store.putJobProgress({ ...hydrated, rowIds: ['row-1', 'row-2', 'mutated-ignored'] })
      expect(store.job(job.id).cursor).toBe(1)
      expect(store.job(job.id).rowIds).toEqual(['row-1', 'row-2'])
    } finally {
      store.close()
    }
  })

  it('migrates legacy cache tables without updated_at and confirms exact metadata matches once per row', () => {
    const db = new Database(':memory:')
    try {
      db.connection.exec(
        'DROP TABLE cache; CREATE TABLE cache(key TEXT PRIMARY KEY, value TEXT NOT NULL);',
      )
      db.prepare('INSERT INTO cache(key, value) VALUES (?, ?)').run(
        'legacy-key',
        JSON.stringify([]),
      )
      const prefs = new Preferences(db)
      const cols = db.prepare('PRAGMA table_info(cache)').all() as { name: string }[]
      expect(cols.some((c) => c.name === 'updated_at')).toBe(true)
      expect(prefs.cached('legacy-key')).toEqual([])
      prefs.cache('new-key', [{ uri: 'spotify:track:' + 'b'.repeat(22) }])
      expect(prefs.cached('new-key')).toHaveLength(1)
    } finally {
      db.close()
    }

    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('Artist - Song\nArtist - Other', '.txt', 'Confirm'))
      const [r1, r2] = store.get(id).rows
      const exactTrack = {
        uri: 'spotify:track:' + 'c'.repeat(22),
        title: 'Song',
        artists: ['Artist'],
        duration: 180,
        album: '',
        url: '',
      }
      store.patch(id, [r1.id], { candidates: [exactTrack], searchedQuery: 'Artist Song' }, false)
      expect(store.confirmMetadataMatches(id, [r1.id])).toBe(1)
      expect(store.row(id, r1.id).working.destination).toBe('spotify')
      expect(() => store.confirmMetadataMatches(id, [r2.id])).toThrow('отдельной проверки')
    } finally {
      store.close()
    }
  })
})
