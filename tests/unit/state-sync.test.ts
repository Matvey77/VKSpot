import { describe, expect, it } from 'vitest'
import { Store } from '../../src/main/storage'
import { parseImport } from '../../src/core/collection'
import { StateReplica } from '../../src/renderer/src/state/replica'
import type { StateCursor, StateSync } from '../../src/shared/sync'

function snapshot(store: Store, cursor: StateCursor | null): StateSync {
  return {
    ...store.collectionSync(cursor),
    overview: {
      jobs: store.jobSummaries(),
      settings: store.settings(),
      spotify: { connected: false, name: '' },
      dataPath: ':memory:',
    },
  }
}

describe('incremental state synchronization', () => {
  it('sends only changed records and keeps unrelated React identities stable', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One\nB - Two\nC - Three', '.txt', 'Fixture'))
      const replica = new StateReplica()
      const first = replica.apply(snapshot(store, null))
      const row = first.collections[0].rows[1]
      store.patch(id, [row.id], { note: 'Reviewed' })
      const delta = snapshot(store, replica.cursor)
      expect(delta.updates).toHaveLength(1)
      expect(delta.updates[0].kind).toBe('patch')
      if (delta.updates[0].kind !== 'patch') throw new Error('Expected patch')
      expect(delta.updates[0].rows.map((row) => row.id)).toEqual([row.id])
      const next = replica.apply(delta)
      expect(next.collections[0].rows[0]).toBe(first.collections[0].rows[0])
      expect(next.collections[0].rows[2]).toBe(first.collections[0].rows[2])
      expect(next.collections[0].rows[1]).not.toBe(row)
      expect(next.collections[0].rows[1].working.note).toBe('Reviewed')
      expect(next.settings).toBe(first.settings)
      expect(next.settings.matchingRules).toBe(first.settings.matchingRules)
      expect(replica.apply(snapshot(store, replica.cursor))).toBe(next)
    } finally {
      store.close()
    }
  })

  it('does not publish rolled-back edits or invalidate the cached collection', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One', '.txt', 'Fixture'))
      const before = snapshot(store, null)
      expect(() =>
        store.patch(id, [store.get(id).rows[0].id, 'missing'], { excluded: true }),
      ).toThrow()
      expect(snapshot(store, before.cursor).updates).toEqual([])
      expect(store.get(id).rows[0].working.excluded).toBe(false)
      expect(store.undo(id)).toBe(false)
    } finally {
      store.close()
    }
  })

  it('handles metadata, ordering, deletion and restart snapshots without stale data', () => {
    const store = new Store(':memory:')
    try {
      const a = store.import(parseImport('A - One', '.txt', 'First'))
      const b = store.import(parseImport('B - Two', '.txt', 'Second'))
      const replica = new StateReplica()
      const first = replica.apply(snapshot(store, null))
      const before = first.collections.find((c) => c.id === a)!
      store.renameCollection(a, 'Renamed')
      store.reorderCollections([a, b])
      const next = replica.apply(snapshot(store, replica.cursor))
      expect(next.collections.map((c) => c.id)).toEqual([a, b])
      expect(next.collections[0].name).toBe('Renamed')
      expect(next.collections[0].rows).toBe(before.rows)
      store.deleteCollection(b)
      expect(replica.apply(snapshot(store, replica.cursor)).collections.map((c) => c.id)).toEqual([
        a,
      ])
      const fresh = snapshot(store, {
        session: '00000000-0000-4000-8000-000000000001',
        revision: 123,
      })
      expect(fresh.updates[0].kind).toBe('replace')
    } finally {
      store.close()
    }
  })

  it('recovers with a snapshot when the bounded journal expires', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One', '.txt', 'Fixture'))
      const cursor = snapshot(store, null).cursor
      const row = store.get(id).rows[0]
      for (let index = 0; index < 515; index++)
        store.patch(id, [row.id], { note: String(index) }, false)
      const next = snapshot(store, cursor)
      expect(next.updates[0].kind).toBe('replace')
      expect(store.row(id, row.id).working.note).toBe('514')
    } finally {
      store.close()
    }
  })

  it('keeps large queue inputs out of progress snapshots and retains them for resume', () => {
    const store = new Store(':memory:')
    try {
      const ids = Array.from({ length: 9000 }, (_, index) => `row-${index}`)
      const job = store.newJob('collection', 'search', ids)
      job.cursor = 123
      store.putJob(job)
      const summaries = store.jobSummaries()
      expect(JSON.stringify(summaries).length).toBeLessThan(1000)
      expect(summaries[0].cursor).toBe(123)
      expect('rowIds' in summaries[0]).toBe(false)
      expect(store.job(job.id).rowIds).toEqual(ids)
    } finally {
      store.close()
    }
  })

  it('restores both source and working data when a synchronization is undone', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One\nB - Two', '.txt', 'Fixture'))
      const original = structuredClone(store.get(id))
      store.patch(id, [original.rows[0].id], { note: 'Keep this' })
      const beforeRepair = structuredClone(store.get(id))
      store.repairCollection(id, parseImport('A - One\nC - Three', '.txt', 'Repair'))
      expect(store.undo(id)).toBe(true)
      expect(store.get(id)).toEqual(beforeRepair)
      expect(store.undo(id)).toBe(true)
      expect(store.get(id).rows[0].working.note).toBe('')
    } finally {
      store.close()
    }
  })

  it('preserves independent decisions and identifiers for repeated VK occurrences', () => {
    const store = new Store(':memory:')
    try {
      const preview = parseImport(
        JSON.stringify([
          { id: 'repeat', artist: 'A', title: 'One' },
          { id: 'repeat', artist: 'A', title: 'One' },
        ]),
        '.json',
        'Repeats',
      )
      const id = store.import(preview)
      const [first, second] = store.get(id).rows
      store.patch(id, [first.id], { note: 'First decision' })
      store.patch(id, [second.id], { note: 'Second decision', excluded: true })
      store.repairCollection(id, preview)
      const repaired = store.get(id)
      expect(repaired.rows.map((row) => row.id)).toEqual([first.id, second.id])
      expect(repaired.rows.map((row) => row.working.note)).toEqual([
        'First decision',
        'Second decision',
      ])
      expect(repaired.rows[0].working.excluded).toBe(false)
      expect(repaired.rows[1].working.excluded).toBe(true)
    } finally {
      store.close()
    }
  })

  it('does not remove unread rows after a shortened partial export', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One\nB - Two\nC - Three', '.txt', 'Fixture'))
      const before = structuredClone(store.get(id))
      const partial = parseImport('A - One', '.txt', 'Partial')
      partial.range = { from: 1, to: 3 }
      store.repairCollection(id, partial)
      expect(store.get(id).rows).toHaveLength(3)
      expect(store.get(id).rows.slice(1)).toEqual(before.rows.slice(1))
    } finally {
      store.close()
    }
  })

  it('marks completeness as unverified when preserving missing user work adds rows', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(parseImport('A - One\nB - Two', '.txt', 'Fixture'))
      store.patch(id, [store.get(id).rows[1].id], { note: 'Do not discard' })
      const preview = parseImport(
        JSON.stringify({ expectedCount: 1, tracks: [{ artist: 'A', title: 'One' }] }),
        '.json',
        'Repair',
      )
      store.repairCollection(id, preview)
      expect(store.get(id).rows).toHaveLength(2)
      expect(store.get(id).completeness.status).toBe('unverified')
    } finally {
      store.close()
    }
  })
})
