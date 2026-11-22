import { describe, expect, it, vi } from 'vitest'
import { classifyVKPage, readVKPageSignals } from '../../src/main/integrations/vk/status'

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

  it('detects English Shuffle button alongside Russian Перемешать and debounces MutationObserver', async () => {
    vi.useFakeTimers()
    const origDocument = globalThis.document
    const origLocation = globalThis.location
    const origGetComputedStyle = globalThis.getComputedStyle
    const origMutationObserver = globalThis.MutationObserver
    try {
      let shuffleVisible = false
      let observerCallback: (() => void) | undefined
      const disconnect = vi.fn()
      const makeElement = (text = '') => ({
        textContent: text,
        getBoundingClientRect: () => ({ width: 100, height: 32 }),
        getAttribute: () => null,
        closest: () => null,
        querySelectorAll: () => [],
      })
      const shuffleBtn = makeElement('Shuffle')
      const trackRow = makeElement('Artist - Track')
      let queryCount = 0
      globalThis.location = { pathname: '/feed' } as unknown as Location
      globalThis.getComputedStyle = (() =>
        ({
          display: 'block',
          visibility: 'visible',
          opacity: '1',
        }) as CSSStyleDeclaration) as typeof getComputedStyle
      globalThis.MutationObserver = class {
        constructor(callback: () => void) {
          observerCallback = callback
        }
        observe = vi.fn()
        disconnect = disconnect
      } as unknown as typeof MutationObserver
      globalThis.document = {
        documentElement: {},
        body: {
          querySelectorAll: (selector: string) => {
            if (selector.includes('.audio_row')) return shuffleVisible ? [trackRow] : []
            return []
          },
        },
        querySelector: () => null,
        querySelectorAll: (selector: string) => {
          queryCount++
          if (selector === 'button, a, [role="button"]') return shuffleVisible ? [shuffleBtn] : []
          return []
        },
      } as unknown as Document

      const pending = readVKPageSignals()
      const initialQueries = queryCount
      shuffleVisible = true
      observerCallback?.()
      observerCallback?.()
      observerCallback?.()
      expect(queryCount).toBe(initialQueries)

      await vi.advanceTimersByTimeAsync(150)
      const signals = await pending
      expect(signals).toEqual({ personalLibrary: true, signInForm: false, pageError: false })
      expect(queryCount).toBeGreaterThan(initialQueries)
      expect(disconnect).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      globalThis.document = origDocument
      globalThis.location = origLocation
      globalThis.getComputedStyle = origGetComputedStyle
      globalThis.MutationObserver = origMutationObserver
    }
  })
})
