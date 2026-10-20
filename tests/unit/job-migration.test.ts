import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '../../src/main/storage'
import type { Job } from '../../src/shared/model'

function cleanup(directory: string): void {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('vkspot-job-migration-')
  )
    throw new Error('Unsafe cleanup')
  rmSync(directory, { recursive: true, force: true })
}

describe('queue storage migration', () => {
  it('moves legacy queue inputs once and preserves cursors, plans and restart behavior', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vkspot-job-migration-'))
    const path = join(directory, 'collection.db')
    try {
      const db = new DatabaseSync(path)
      db.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
      const job: Job = {
        id: 'legacy',
        collectionId: 'collection',
        kind: 'transfer',
        state: 'running',
        cursor: 42,
        total: 9000,
        rowIds: Array.from({ length: 9000 }, (_, index) => `row-${index}`),
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        message: 'Previous application version',
        plan: [
          {
            rowId: 'local',
            position: 1,
            artist: 'Artist',
            title: 'Song',
            version: '',
            destination: 'local',
            uri: null,
            local: null,
          },
        ],
      }
      db.prepare('INSERT INTO jobs VALUES(?,?)').run(job.id, JSON.stringify(job))
      db.close()
      const migrated = new Store(path)
      expect(migrated.job(job.id).rowIds).toEqual(job.rowIds)
      expect(migrated.job(job.id).plan).toEqual(job.plan)
      expect(migrated.job(job.id).cursor).toBe(42)
      expect(migrated.job(job.id).state).toBe('paused')
      expect(migrated.jobSummaries()[0].localCount).toBe(1)
      migrated.close()
      const inspect = new DatabaseSync(path, { readOnly: true })
      const runtime = inspect.prepare('SELECT payload FROM jobs WHERE id=?').get(job.id) as {
        payload: string
      }
      expect(runtime.payload.length).toBeLessThan(1000)
      expect(JSON.parse(runtime.payload).rowIds).toBeUndefined()
      inspect.close()
      const reopened = new Store(path)
      expect(reopened.job(job.id).rowIds).toEqual(job.rowIds)
      reopened.archiveJob(job.id)
      expect(reopened.jobs()).toEqual([])
      reopened.close()
    } finally {
      cleanup(directory)
    }
  })
})
