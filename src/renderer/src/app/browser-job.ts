import type { JobSummary } from '../../../shared/sync'

/** Returns the most recently updated paused browser-search job ID, if any. */
export function findPausedBrowserJobId(
  jobs: readonly JobSummary[] | undefined,
): string | undefined {
  if (!jobs?.length) return undefined
  let latest: JobSummary | undefined
  for (const job of jobs) {
    if (job.kind !== 'search' || job.searchProvider !== 'browser' || job.state !== 'paused') {
      continue
    }
    if (!latest || job.updatedAt.localeCompare(latest.updatedAt) > 0) {
      latest = job
    }
  }
  return latest?.id
}
