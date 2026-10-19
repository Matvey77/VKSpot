import { describe, it, expect } from 'vitest'
import { Store } from '../../src/main/store'
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
})
