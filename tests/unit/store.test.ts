import { describe, it, expect } from 'vitest'
import { Store } from '../../src/main/storage'
import { parseImport, exportText } from '../../src/core/collection'
import { workingPatchSchema } from '../../src/shared/model'

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
})
