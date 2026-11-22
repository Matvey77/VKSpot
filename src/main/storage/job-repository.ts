import { randomUUID } from 'node:crypto'
import type { Job, PlanItem } from '../../shared/model'
import type { JobSummary } from '../../shared/sync'
import type { Database } from './database'

type Details = { rowIds: string[]; plan?: PlanItem[]; localCount: number }
type Runtime = Omit<Job, 'rowIds' | 'plan'> &
  Partial<Pick<Job, 'rowIds' | 'plan'>> & { localCount?: number }

function countLocal(plan?: readonly PlanItem[]): number {
  return plan?.filter((item) => item.destination === 'local').length ?? 0
}

function clonePlan(plan?: readonly PlanItem[]): PlanItem[] | undefined {
  return plan?.map((item) => ({ ...item, local: item.local ? { ...item.local } : null }))
}

function samePlanItem(a: PlanItem, b: PlanItem): boolean {
  if (
    a.rowId !== b.rowId ||
    a.position !== b.position ||
    a.artist !== b.artist ||
    a.title !== b.title ||
    a.version !== b.version ||
    a.destination !== b.destination ||
    a.uri !== b.uri
  ) {
    return false
  }
  if (a.local === b.local) return true
  if (!a.local || !b.local) return false
  return (
    a.local.path === b.local.path &&
    a.local.sha256 === b.local.sha256 &&
    a.local.artist === b.local.artist &&
    a.local.title === b.local.title &&
    a.local.duration === b.local.duration &&
    a.local.codec === b.local.codec &&
    a.local.bitrate === b.local.bitrate &&
    a.local.size === b.local.size
  )
}

function detailsEqual(cached: Details, rowIds: string[], plan?: PlanItem[]): boolean {
  if (cached.rowIds.length !== rowIds.length) return false
  for (let i = 0; i < rowIds.length; i++) {
    if (cached.rowIds[i] !== rowIds[i]) return false
  }
  if ((cached.plan === undefined) !== (plan === undefined)) return false
  if (!cached.plan || !plan) return true
  if (cached.plan.length !== plan.length) return false
  for (let i = 0; i < plan.length; i++) {
    if (!samePlanItem(cached.plan[i], plan[i])) return false
  }
  return true
}

/** Large immutable queue inputs are stored once, separately from the changing cursor. */
export class JobRepository {
  private details = new Map<string, Details>()

  constructor(private db: Database) {
    db.connection.exec(
      'CREATE TABLE IF NOT EXISTS job_details(id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, row_ids TEXT NOT NULL, plan TEXT);',
    )
    if (db.userVersion() < 1) {
      this.migrateLegacyJobs()
    }
  }

  private migrateLegacyJobs(): void {
    this.db.transaction(() => {
      const old = this.db.prepare('SELECT id,payload FROM jobs').all() as {
        id: string
        payload: string
      }[]
      for (const row of old) {
        const job = JSON.parse(row.payload) as Runtime
        if (job.rowIds) this.put(job as Job)
      }
      this.db.setUserVersion(1)
    })
  }

  private loadDetails(id: string): Details {
    const cached = this.details.get(id)
    if (cached) return cached
    const row = this.db.prepare('SELECT row_ids,plan FROM job_details WHERE id=?').get(id) as
      { row_ids: string; plan: string | null } | undefined
    const rowIds = row ? (JSON.parse(row.row_ids) as string[]) : []
    const plan = row?.plan ? (JSON.parse(row.plan) as PlanItem[]) : undefined
    const value: Details = {
      rowIds,
      ...(plan ? { plan } : {}),
      localCount: countLocal(plan),
    }
    this.details.set(id, value)
    return value
  }

  private hydrate(runtime: Runtime): Job {
    const details = this.loadDetails(runtime.id)
    const plan = runtime.plan ?? details.plan
    return {
      ...runtime,
      rowIds: [...(runtime.rowIds ?? details.rowIds)],
      ...(plan ? { plan: clonePlan(plan) } : {}),
    }
  }

  private writeRuntimePayload(runtime: Omit<Job, 'rowIds' | 'plan'>, localCount: number): void {
    this.db
      .prepare(
        'INSERT INTO jobs(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(runtime.id, JSON.stringify({ ...runtime, localCount }))
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
        localCount: runtime.localCount ?? countLocal(plan),
      }
    })
  }

  get(id: string): Job {
    const row = this.db.prepare('SELECT payload FROM jobs WHERE id=?').get(id) as
      { payload: string } | undefined
    if (!row) throw new Error('Задание не найдено.')
    return this.hydrate(JSON.parse(row.payload))
  }

  putProgress(job: Job): void {
    job.updatedAt = new Date().toISOString()
    const { rowIds: _rowIds, plan, ...runtime } = job
    const localCount = plan ? countLocal(plan) : this.loadDetails(job.id).localCount
    this.writeRuntimePayload(runtime, localCount)
  }

  put(job: Job): void {
    job.updatedAt = new Date().toISOString()
    const { rowIds, plan, ...runtime } = job
    const cached = this.details.get(job.id)
    const changedDetails = !cached || !detailsEqual(cached, rowIds, plan)
    const localCount = countLocal(plan)
    this.db.transaction(() => {
      this.writeRuntimePayload(runtime, localCount)
      if (changedDetails)
        this.db
          .prepare(
            'INSERT INTO job_details(id,row_ids,plan) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET row_ids=excluded.row_ids,plan=excluded.plan',
          )
          .run(job.id, JSON.stringify(rowIds), plan ? JSON.stringify(plan) : null)
    })
    if (changedDetails) {
      this.details.set(job.id, {
        rowIds: [...rowIds],
        ...(plan ? { plan: clonePlan(plan) } : {}),
        localCount,
      })
    }
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
      rowIds: [...rowIds],
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
