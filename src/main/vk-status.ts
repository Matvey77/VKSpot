import type { VKStatus } from '../shared/model'

export type VKPageSignals = {
  personalLibrary: boolean
  signInForm: boolean
  pageError: boolean
}

export function classifyVKPage(signals: VKPageSignals): Pick<VKStatus, 'state' | 'message'> {
  if (signals.signInForm) return { state: 'sign-in', message: 'VK просит войти в аккаунт.' }
  if (signals.personalLibrary)
    return { state: 'connected', message: 'Личная библиотека VK отображается.' }
  if (signals.pageError) return { state: 'error', message: 'VK показал ошибку страницы.' }
  return { state: 'unknown', message: 'Статус не подтверждён по видимому содержимому VK.' }
}

// Runs in an isolated world and returns only booleans about visible page cues.
// It never reads page globals, credentials, cookies, or network state.
export function readVKPageSignals(): Promise<VKPageSignals> {
  const inspect = (): VKPageSignals => {
    const visible = (element: Element): boolean => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0
      )
    }
    const rowSelector =
      '.audio_row, .audio_item, [data-testid*="MusicTrack"], [data-full-id], [data-audio-id], [data-audio]'
    const hasVisibleRows = (container: Element): boolean => {
      for (const candidate of container.querySelectorAll(rowSelector)) {
        const row =
          candidate.closest(
            '.audio_row, .audio_item, [data-testid*="MusicTrack"], [data-full-id], [data-audio-id]',
          ) ?? candidate
        if (visible(row)) return true
      }
      return false
    }

    const isAudioPath =
      location.pathname.startsWith('/audio') ||
      location.pathname.startsWith('/music') ||
      location.pathname.includes('/audios')

    const modernLibrary = [
      ...document.querySelectorAll(
        '[data-testid*="AudioCatalog"], [data-testid*="MusicTrack"], [data-testid="AudioCatalog_SectionMyTracks"]',
      ),
    ].some((section) => visible(section) && hasVisibleRows(section))

    const libraryTab = [
      ...document.querySelectorAll(
        '[role="tab"], .ui_tab, .vkuiTabsItem, a[href*="/audio"], [data-testid*="Tab"]',
      ),
    ].some((tab) => {
      if (!visible(tab)) return false
      const text = tab.textContent?.trim().toLocaleLowerCase() ?? ''
      return ['моя музыка', 'мои аудиозаписи', 'my music', 'my audio'].includes(text)
    })

    const libraryHeading = [
      ...document.querySelectorAll('h1, h2, h3, [role="heading"], .audio_page__header'),
    ].some((heading) => {
      if (!visible(heading)) return false
      const text = heading.textContent?.replace(/\s+/g, ' ').trim().toLocaleLowerCase() ?? ''
      return [
        'моя музыка',
        'мои аудиозаписи',
        'my music',
        'my audio',
        'треки',
        'плейлисты',
        'недавно прослушанные',
      ].includes(text)
    })

    const allTracksTab = document.querySelector('[data-testid="AudioCatalog_Tabs_Tab_all"]')
    const allTracksSelected = !allTracksTab || allTracksTab.getAttribute('aria-selected') === 'true'
    const classicContainer =
      allTracksSelected &&
      [...document.querySelectorAll('#au_search_items, .audio_page__audio_rows_list')].some(
        (container) => visible(container) && hasVisibleRows(container),
      )
    const genericLibraryList = [
      ...document.querySelectorAll(
        '[data-testid="MusicTracksList"], [data-testid="MusicTrackList"]',
      ),
    ].some((container) => visible(container) && hasVisibleRows(container))

    const shuffleButton = [...document.querySelectorAll('button, a, [role="button"]')].some(
      (el) => visible(el) && /перемешать/i.test(el.textContent ?? ''),
    )

    const visibleRowsFound = hasVisibleRows(document.body)

    const signInForm =
      [...document.querySelectorAll('input[type="password"]')].some(visible) ||
      [...document.querySelectorAll('form[action]')].some((form) => {
        const action = form.getAttribute('action')?.toLocaleLowerCase() ?? ''
        return visible(form) && /login|auth|sign.?in/.test(action)
      })
    const pageError = [
      ...document.querySelectorAll('.error_page, [data-testid*="error"], [role="alert"]'),
    ]
      .filter(visible)
      .some((element) =>
        /page not found|something went wrong|страница не найдена|ошибка загрузки|не удалось загрузить/i.test(
          element.textContent ?? '',
        ),
      )

    const personalLibrary =
      !signInForm &&
      (modernLibrary ||
        classicContainer ||
        (libraryHeading && genericLibraryList) ||
        (isAudioPath && visibleRowsFound) ||
        (libraryTab && visibleRowsFound) ||
        (shuffleButton && visibleRowsFound))

    return {
      personalLibrary,
      signInForm,
      pageError,
    }
  }
  const decisive = (signals: VKPageSignals) =>
    signals.personalLibrary || signals.signInForm || signals.pageError
  return new Promise((resolve) => {
    let finished = false
    const finish = (signals: VKPageSignals) => {
      if (finished) return
      finished = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(signals)
    }
    const check = () => {
      const signals = inspect()
      if (decisive(signals)) finish(signals)
    }
    const observer = new MutationObserver(check)
    if (document.documentElement)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'aria-hidden',
          'aria-selected',
          'class',
          'data-audio',
          'data-audio-id',
          'data-full-id',
          'data-testid',
          'hidden',
          'style',
        ],
        characterData: true,
      })
    const timer = setTimeout(() => finish(inspect()), 10000)
    check()
  })
}
