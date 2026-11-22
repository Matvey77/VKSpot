import type { ImportPreview, Job, Working } from '../../shared/model'
import type { StateCursor } from '../../shared/sync'
import { Database } from './database'
import { Preferences } from './preferences'
import { CollectionRepository, type WorkingPatchItem } from './collection-repository'
import { JobRepository } from './job-repository'

/** Application storage facade. SQL, collection history and queues have separate owners. */
export class Store {
  private db: Database
  private preferences: Preferences
  private collections: CollectionRepository
  private queue: JobRepository

  constructor(path: string) {
    this.db = new Database(path)
    this.preferences = new Preferences(this.db)
    this.collections = new CollectionRepository(this.db, this.preferences)
    this.queue = new JobRepository(this.db)
    for (const summary of this.jobSummaries()) {
      if (summary.state === 'running' || summary.state === 'pausing') {
        const job = this.job(summary.id)
        if (job.kind === 'transfer' && !job.playlistId && job.cursor === 0) {
          this.putJob(
            {
              ...job,
              state: 'needs-review',
              autoResume: false,
              message:
                'Приложение закрылось во время создания плейлиста. Проверьте Spotify и при необходимости укажите созданный плейлист для продолжения.',
            },
            true,
          )
        } else {
          this.putJob(
            {
              ...job,
              state: 'paused',
              autoResume:
                job.kind === 'search' && job.backgroundSearch === true && job.autoResume !== false,
              message: 'Прервано закрытием приложения. Можно продолжить.',
            },
            true,
          )
        }
      }
    }
  }

  close = (): void => this.db.close()
  all = () => this.collections.all()
  get = (id: string) => this.collections.get(id)
  row = (collectionId: string, id: string) => this.collections.row(collectionId, id)
  collectionSync = (cursor: StateCursor | null) => this.collections.sync(cursor)
  import = (preview: ImportPreview) => this.collections.import(preview)
  renameCollection = (id: string, name: string) => this.collections.rename(id, name)
  reorderCollections = (ids: string[]) => this.collections.reorder(ids)
  deleteCollection = (id: string) => {
    this.collections.remove(id)
    this.queue.prune()
  }
  repairCollection = (id: string, preview: ImportPreview) => this.collections.repair(id, preview)
  patch = (id: string, rows: string[], patch: Partial<Working>, history = true) =>
    this.collections.patch(id, rows, patch, history)
  patchMany = (id: string, updates: WorkingPatchItem[], history = false) =>
    this.collections.patchMany(id, updates, history)
  confirmMetadataMatches = (id: string, rows: string[]) => this.collections.confirm(id, rows)
  undo = (id: string) => this.collections.undo(id)
  settings = () => this.preferences.settings()
  value = <T>(key: string, fallback: T): T => this.preferences.value(key, fallback)
  setValue = (key: string, value: unknown) => this.preferences.setValue(key, value)
  cached = <T>(key: string): T | null => this.preferences.cached(key)
  cache = (key: string, value: unknown) => this.preferences.cache(key, value)
  jobs = () => this.queue.all()
  jobSummaries = () => this.queue.summaries()
  job = (id: string) => this.queue.get(id)
  putJob = (job: Job, progressOnly = false) =>
    progressOnly ? this.queue.putProgress(job) : this.queue.put(job)
  putJobProgress = (job: Job) => this.queue.putProgress(job)
  newJob = (id: string, kind: Job['kind'], rows: string[]) => this.queue.create(id, kind, rows)
  archiveJob = (id: string) => this.queue.remove(id)
  archiveFinishedJobs = () => this.queue.removeFinished()
}
