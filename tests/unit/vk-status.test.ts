import { describe, expect, it } from 'vitest'
import { classifyVKPage } from '../../src/main/vk-status'

describe('VK visible-page status', () => {
  it('recognizes a rendered modern or classic personal library', () => {
    expect(
      classifyVKPage({ personalLibrary: true, signInForm: false, pageError: false }),
    ).toMatchObject({ state: 'connected' })
  })

  it('prefers a visible sign-in form over stale library rows', () => {
    expect(
      classifyVKPage({ personalLibrary: true, signInForm: true, pageError: false }),
    ).toMatchObject({ state: 'sign-in' })
  })

  it('does not treat an open window or a music URL as proof of a connected session', () => {
    expect(
      classifyVKPage({ personalLibrary: false, signInForm: false, pageError: false }),
    ).toMatchObject({ state: 'unknown' })
  })

  it('reports visible page errors when no stronger auth cue is present', () => {
    expect(
      classifyVKPage({ personalLibrary: false, signInForm: false, pageError: true }),
    ).toMatchObject({ state: 'error' })
  })
})
