import { randomUUID } from 'node:crypto'
import type { Job } from '../../shared/model'
import type { JobSummary } from '../../shared/sync'
import type { Database } from './database'

type Details = Pick<Job, 'rowIds' | 'plan'>
type Runtime = Omit<Job, 'rowIds' | 'plan'> & Partial<Details> & { localCount?: number }

/** Large immutable queue inputs are stored once, separately from the changing cursor. */
export class JobRepository {
  private details = new Map<string, Details>()

  constructor(private db: Database) {
    db.connection.exec(
      'CREATE TABLE IF NOT EXISTS job_details(id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, row_ids TEXT NOT NULL, plan TEXT);',
    )
    const old = db.prepare('SELECT id,payload FROM jobs').all() as { id: string; payload: string }[]
    db.transaction(() => {
      for (const row of old) {
        const job = JSON.parse(row.payload) as Runtime
        if (job.rowIds) this.put(job as Job)
      }
    })
  }

  private loadDetails(id: string): Details {
    const cached = this.details.get(id)
    if (cached) return cached
    const row = this.db.prepare('SELECT row_ids,plan FROM job_details WHERE id=?').get(id) as
      { row_ids: string; plan: string | null } | undefined
    const value: Details = {
      rowIds: row ? JSON.parse(row.row_ids) : [],
      ...(row?.plan ? { plan: JSON.parse(row.plan) } : {}),
    }
    this.details.set(id, value)
    return value
  }

  private hydrate(runtime: Runtime): Job {
    const details = this.loadDetails(runtime.id)
    return {
      ...runtime,
      rowIds: runtime.rowIds ?? details.rowIds,
      plan: runtime.plan ?? details.plan,
    }
  }

  all(): Job[] {
    return (
      this.db.prepare('SELECT payload FROM jobs ORDER BY rowid DESC').all() as { payload: string }[]
    ).map((row) => this.hydrate(JSON.parse(row.payload)))
  }

  summaries(): JobSummary[] {
    return (
      this.db.prepare('SELECT payload FROM jobs ORDER BY rowid DESC').all() as { payload: string }[]
    ).map((row) => {
      const { rowIds: _rowIds, plan, ...runtime } = JSON.parse(row.payload) as Runtime
      return {
        ...runtime,
        localCount:
          runtime.localCount ?? plan?.filter((item) => item.destination === 'local').length ?? 0,
      }
    })
  }

  get(id: string): Job {
    const row = this.db.prepare('SELECT payload FROM jobs WHERE id=?').get(id) as
      { payload: string } | undefined
    if (!row) throw new Error('Задание не найдено.')
    return this.hydrate(JSON.parse(row.payload))
  }

  put(job: Job): void {
    job.updatedAt = new Date().toISOString()
    const { rowIds, plan, ...runtime } = job
    const cached = this.details.get(job.id)
    const changedDetails = !cached || cached.rowIds !== rowIds || cached.plan !== plan
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO jobs(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        )
        .run(
          job.id,
          JSON.stringify({
            ...runtime,
            localCount: plan?.filter((item) => item.destination === 'local').length ?? 0,
          }),
        )
      if (changedDetails)
        this.db
          .prepare(
            'INSERT INTO job_details(id,row_ids,plan) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET row_ids=excluded.row_ids,plan=excluded.plan',
          )
          .run(job.id, JSON.stringify(rowIds), plan ? JSON.stringify(plan) : null)
    })
    if (changedDetails) this.details.set(job.id, { rowIds, plan })
  }

  prune(): void {
    const ids = new Set(
      (this.db.prepare('SELECT id FROM jobs').all() as { id: string }[]).map((row) => row.id),
    )
    for (const id of this.details.keys()) if (!ids.has(id)) this.details.delete(id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM jobs WHERE id=?').run(id)
    this.details.delete(id)
  }

  removeFinished(): number {
    const finished = this.summaries().filter(
      (job) => job.state === 'complete' || job.state === 'failed',
    )
    this.db.transaction(() => finished.forEach((job) => this.remove(job.id)))
    return finished.length
  }

  create(collectionId: string, kind: Job['kind'], rowIds: string[]): Job {
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
    this.put(job)
    return job
  }
}
