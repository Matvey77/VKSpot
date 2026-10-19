import { describe, expect, it } from 'vitest'
import {
  jobMessage,
  resumeDisabledReason,
  retryDeadline,
  waitingJob,
  waitDuration,
} from '../../src/shared/job-status'
import type { Job } from '../../src/shared/model'

const now = Date.parse('2026-10-18T02:00:00Z')
const paused = (patch: Partial<Job> = {}): Job => ({
  id: 'test',
  collectionId: 'collection',
  kind: 'search',
  state: 'paused',
  cursor: 719,
  total: 8939,
  rowIds: [],
  message: 'Квота Spotify исчерпана. Повтор не раньше чем через 19173 с.',
  retryAt: now + 11704 * 1000,
  createdAt: '',
  updatedAt: '',
  ...patch,
})

describe('Spotify wait presentation', () => {
  it('reads old saved jobs and shows the current wait instead of the original seconds', () => {
    const job = paused()
    const message = jobMessage(job, now)
    expect(message).toContain('Исчерпана квота')
    expect(message).toContain('3 ч 16 мин')
    expect(message).toContain('время компьютера')
    expect(message).not.toContain('19173')
    expect(job.cursor).toBe(719)
    expect(waitDuration(60000)).toBe('1 мин')
    expect(waitDuration(59001)).toBe('60 с')
    expect(waitDuration(3600000)).toBe('1 ч')
    expect(waitDuration(86400000)).toBe('1 д')
  })
  it('enables manual continuation at the deadline without promising a quota reset', () => {
    const job = paused()
    expect(resumeDisabledReason(job, [job], job.retryAt! - 1, false, true)).toContain(
      'Повтор не раньше',
    )
    expect(resumeDisabledReason(job, [job], job.retryAt!, false, true)).toBeUndefined()
    expect(jobMessage(job, job.retryAt!)).toContain('Нажми «Продолжить»')
    expect(jobMessage(job, job.retryAt!)).toContain('снова ограничить')
    expect(resumeDisabledReason(job, [job], job.retryAt!, false, false)).toContain(
      'Подключи Spotify',
    )
    expect(jobMessage(paused({ retryAt: undefined }), now)).toContain('19173')
  })
  it('distinguishes a rate limit and uses the latest active deadline across jobs', () => {
    const first = paused({ waitReason: 'rate-limit' })
    const later = paused({ id: 'later', retryAt: first.retryAt! + 1000 })
    const complete = paused({ id: 'complete', state: 'complete', retryAt: later.retryAt! + 10000 })
    expect(jobMessage(first, now)).toContain('частоту запросов')
    expect(waitingJob([first, later, complete], now)?.id).toBe('later')
    expect(retryDeadline([first, later, complete])).toBe(later.retryAt)
    expect(waitingJob([first], first.retryAt!)).toBeUndefined()
    expect(jobMessage(complete, now)).toBe(complete.message)
  })
})
