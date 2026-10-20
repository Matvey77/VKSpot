import type { AppState, Collection, Job, TrackRow } from './model'

/** A cursor belongs to one main-process lifetime. A restart requires a fresh snapshot. */
export type StateCursor = { session: string; revision: number }
export type CollectionMetadata = Omit<Collection, 'rows'>
export type CollectionUpdate =
  | { kind: 'replace'; collection: Collection }
  | { kind: 'patch'; id: string; metadata?: CollectionMetadata; rows: TrackRow[] }

/** Queue internals and full transfer plans never travel with progress notifications. */
export type JobSummary = Omit<Job, 'rowIds' | 'plan'> & { localCount: number }
export type StateOverview = Omit<AppState, 'collections' | 'jobs'> & { jobs: JobSummary[] }
export type ViewState = StateOverview & { collections: Collection[] }
export type StateSync = {
  cursor: StateCursor
  order: string[]
  updates: CollectionUpdate[]
  overview: StateOverview
}
