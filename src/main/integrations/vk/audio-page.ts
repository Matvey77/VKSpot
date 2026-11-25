import type { VKAudioTrack, VKAudioResult } from './audio'

/** Public DOM only. Executed in an isolated world; no page globals or credentials are read. */
export function readVKLibraryLink(): string | null {
  const tab =
    document.querySelector<HTMLAnchorElement>('[data-testid="AudioCatalog_Tabs_Tab_all"]') ??
    [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/audios"]')].find((link) =>
      /моя музыка|мои аудиозаписи|my music|my audio/i.test(link.textContent ?? ''),
    ) ??
    [
      ...document.querySelectorAll<HTMLAnchorElement>('a[href*="/audios"][href*="section=all"]'),
    ].find((link) => !/[?&]block=/.test(link.href))
  return tab?.href ?? null
}

/** Public DOM only. Detects a visible VK sign-in gate in an isolated world. */
export function isVKSignInPage(): boolean {
  const visible = (node: Element) => {
    const style = getComputedStyle(node)
    return (
      node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    )
  }
  return (
    [
      ...document.querySelectorAll(
        'input[type="password"], #login_mobile, .login_form, .vkc__AuthRoot__content, [data-test-id="login-form"]',
      ),
    ].some(visible) ||
    /^(?:login|id)\.vk\./.test(location.hostname) ||
    location.pathname.startsWith('/join')
  )
}

/** Cancels the scanner before pausing; never clicks a control that can start playback. */
export function stopVKAudioPage(): void {
  const world = globalThis as typeof globalThis & { __VKSPOT_AUDIO__?: { cancelled: boolean } }
  if (world.__VKSPOT_AUDIO__) world.__VKSPOT_AUDIO__.cancelled = true
  const visible = (node: Element) =>
    node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
  const rowScope =
    '.audio_row, .audio_item, [data-testid="MusicTrackRow"], [data-audio-id], [data-testentitytag="audio"]'
  const top = [
    ...document.querySelectorAll<HTMLElement>('[data-testid="TopAudioPlayer_TogglePlayAction"]'),
  ].find(visible)
  if (top) {
    if (/приостановить|пауза|pause/i.test(top.textContent ?? '')) top.click()
  } else {
    const barPause = [...document.querySelectorAll<HTMLElement>('button')].find((node) => {
      if (!visible(node) || node.closest(rowScope)) return false
      const label =
        (node.textContent ?? '').trim() || (node.getAttribute('aria-label') ?? '').trim()
      return /^(?:приостановить|пауза|pause)$/i.test(label)
    })
    if (barPause) {
      barPause.click()
    } else {
      const rowPause =
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-testid="MusicTrackRow_Pause"], button[aria-label="Пауза"], button[aria-label="Pause"], .audio_row_playing .audio_row__play_btn',
          ),
        ].find(visible) ??
        [...document.querySelectorAll<HTMLElement>('[role="button"][aria-label]')].find((node) => {
          if (!visible(node)) return false
          const label = node.getAttribute('aria-label') ?? ''
          return (
            /паузу|пауза|приостановить|pause/i.test(label) &&
            !/начать|воспроизвести|слушать|play/i.test(label)
          )
        })
      rowPause?.click()
    }
  }
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause())
}

/** Public DOM only. Executed in an isolated world; sets VK player and media volume (0-100). */
export function setVKAudioVolume(volume: number): boolean {
  const pct = Math.max(0, Math.min(100, Math.round(Number(volume))))
  const ratio = pct / 100
  let updated = false
  for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) {
    media.volume = ratio
    media.muted = pct === 0
    updated = true
  }
  const visible = (node: Element) => {
    const style = getComputedStyle(node)
    return (
      node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    )
  }
  const muteBtn =
    [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find((el) => {
      if (!visible(el)) return false
      const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.trim()
      return /выключить звук|включить звук|mute|unmute/i.test(label)
    }) ?? null
  let slider: HTMLElement | null = null
  let wrap = muteBtn?.parentElement ?? null
  for (let depth = 0; depth < 3 && wrap; depth++) {
    const candidate = [
      ...wrap.querySelectorAll<HTMLElement>('[role="slider"], input[type="range"]'),
    ].find(visible)
    if (candidate) {
      slider = candidate
      break
    }
    wrap = wrap.parentElement
  }
  if (!slider) {
    slider =
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid*="Volume" i] [role="slider"], [data-testid*="Volume" i] input[type="range"], .audio_page_player_volume_slider, .top_audio_player_volume_slider',
        ),
      ].find(visible) ?? null
  }
  if (slider) {
    if (muteBtn && pct > 0) {
      const label =
        `${muteBtn.textContent ?? ''} ${muteBtn.getAttribute('aria-label') ?? ''}`.trim()
      if (/включить звук|unmute/i.test(label)) muteBtn.click()
    }
    if (slider.tagName === 'INPUT' && (slider as HTMLInputElement).type === 'range') {
      const input = slider as HTMLInputElement
      const min = Number.isFinite(Number(input.min)) && input.min !== '' ? Number(input.min) : 0
      const max = Number.isFinite(Number(input.max)) && input.max !== '' ? Number(input.max) : 1
      const target = min + (max - min) * ratio
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(input, String(target))
      else input.value = String(target)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      updated = true
    } else {
      const rect = slider.getBoundingClientRect()
      if (rect.width > 0) {
        const x = rect.left + rect.width * ratio
        const y = rect.top + rect.height / 2
        const downOpts = {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        }
        const upOpts = { ...downOpts, buttons: 0 }
        slider.dispatchEvent(new PointerEvent('pointerdown', downOpts))
        slider.dispatchEvent(new MouseEvent('mousedown', downOpts))
        slider.dispatchEvent(new PointerEvent('pointermove', downOpts))
        slider.dispatchEvent(new MouseEvent('mousemove', downOpts))
        slider.dispatchEvent(new PointerEvent('pointerup', upOpts))
        slider.dispatchEvent(new MouseEvent('mouseup', upOpts))
        slider.dispatchEvent(new MouseEvent('click', upOpts))
        updated = true
      }
    }
  }
  return updated
}

export async function playVKLibraryTrack(track: VKAudioTrack): Promise<VKAudioResult> {
  const world = globalThis as typeof globalThis & {
    __VKSPOT_AUDIO__?: { cancelled: boolean; message?: string }
  }
  if (world.__VKSPOT_AUDIO__) world.__VKSPOT_AUDIO__.cancelled = true
  const operation = { cancelled: false, message: 'Ищем запись в «Моей музыке» VK…' }
  world.__VKSPOT_AUDIO__ = operation
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const cancelled = () => operation.cancelled || world.__VKSPOT_AUDIO__ !== operation
  const fail = (error: string): VKAudioResult => ({ playing: false, error })
  const normal = (text: string) =>
    text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
  const decode = (value: unknown) => {
    const template = document.createElement('template')
    template.innerHTML = typeof value === 'string' ? value : ''
    return template.content.textContent?.trim() ?? ''
  }
  const durationPattern = /^\d+(?::\d{2}){1,2}$/
  const excluded =
    'aside, .audioPlaylistSnippet, [data-testid*="PlaylistSnippet"], [data-testid*="Recommendation"], [data-testid*="Recent"], [data-testid*="History"], [data-testid*="Friends"], [data-testid*="Curator"]'
  const rootSelector =
    '.audio_row, .audio_item, [data-testid="MusicTrackRow"], [class*="MusicTrackRow_root"], [class*="MusicTrackRow__root"], [data-testentitytag="audio"]'
  const selector = rootSelector + ', [data-audio-id], [data-full-id], [data-audio]'
  const visible = (node: Element) => {
    const style = getComputedStyle(node)
    return (
      node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    )
  }
  const firstVisible = (sel: string) => [...document.querySelectorAll(sel)].find(visible)
  const applyInitialVolume = (volume: number): boolean => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(volume))))
    const ratio = pct / 100
    let updated = false
    for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) {
      media.volume = ratio
      media.muted = pct === 0
      updated = true
    }
    const muteBtn =
      [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find((el) => {
        if (!visible(el)) return false
        const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.trim()
        return /выключить звук|включить звук|mute|unmute/i.test(label)
      }) ?? null
    let slider: HTMLElement | null = null
    let wrap = muteBtn?.parentElement ?? null
    for (let depth = 0; depth < 3 && wrap; depth++) {
      const candidate = [
        ...wrap.querySelectorAll<HTMLElement>('[role="slider"], input[type="range"]'),
      ].find(visible)
      if (candidate) {
        slider = candidate
        break
      }
      wrap = wrap.parentElement
    }
    if (!slider) {
      slider =
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-testid*="Volume" i] [role="slider"], [data-testid*="Volume" i] input[type="range"], .audio_page_player_volume_slider, .top_audio_player_volume_slider',
          ),
        ].find(visible) ?? null
    }
    if (slider) {
      if (muteBtn && pct > 0) {
        const label =
          `${muteBtn.textContent ?? ''} ${muteBtn.getAttribute('aria-label') ?? ''}`.trim()
        if (/включить звук|unmute/i.test(label)) muteBtn.click()
      }
      if (slider.tagName === 'INPUT' && (slider as HTMLInputElement).type === 'range') {
        const input = slider as HTMLInputElement
        const min = Number.isFinite(Number(input.min)) && input.min !== '' ? Number(input.min) : 0
        const max = Number.isFinite(Number(input.max)) && input.max !== '' ? Number(input.max) : 1
        const target = min + (max - min) * ratio
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(input, String(target))
        else input.value = String(target)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        updated = true
      } else {
        const rect = slider.getBoundingClientRect()
        if (rect.width > 0) {
          const x = rect.left + rect.width * ratio
          const y = rect.top + rect.height / 2
          const downOpts = {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          }
          const upOpts = { ...downOpts, buttons: 0 }
          slider.dispatchEvent(new PointerEvent('pointerdown', downOpts))
          slider.dispatchEvent(new MouseEvent('mousedown', downOpts))
          slider.dispatchEvent(new PointerEvent('pointermove', downOpts))
          slider.dispatchEvent(new MouseEvent('mousemove', downOpts))
          slider.dispatchEvent(new PointerEvent('pointerup', upOpts))
          slider.dispatchEvent(new MouseEvent('mouseup', upOpts))
          slider.dispatchEvent(new MouseEvent('click', upOpts))
          updated = true
        }
      }
    }
    return updated
  }
  const readSpacedText = (root: Element | null | undefined): string => {
    if (!root) return ''
    let out = ''
    const append = (chunk: string) => {
      if (!chunk) return
      if (/^\s+$/.test(chunk)) {
        if (out && !/\s$/.test(out)) out += ' '
        return
      }
      if (out && !/\s$/.test(out) && !/^[\s,;]/.test(chunk)) out += ' '
      out += chunk
    }
    const visit = (node: Node) => {
      if (node.nodeType === 3) {
        append(node.textContent ?? '')
        return
      }
      if (node.nodeType !== 1) return
      const el = node as Element
      if (el.tagName.toLowerCase() === 'svg' || el.getAttribute('aria-hidden') === 'true') return
      for (const child of el.childNodes) visit(child)
    }
    visit(root)
    return out.replace(/\s+/g, ' ').trim()
  }
  const isNodePlaying = (node: HTMLElement) =>
    node.matches('[data-playing="1"], .audio_row_playing') ||
    Boolean(node.querySelector('[data-testid="MusicTrackRow_Pause"]')) ||
    [...node.querySelectorAll<HTMLElement>('[role="button"][aria-label]')].some((btn) => {
      const label = btn.getAttribute('aria-label') ?? ''
      return (
        /паузу|пауза|приостановить|pause/i.test(label) &&
        !/начать|воспроизвести|слушать|play/i.test(label)
      )
    })
  const rowStructure = (node: HTMLElement) => {
    const disabledHost = node.matches('[aria-disabled]')
      ? node
      : ([...node.querySelectorAll<HTMLElement>('[aria-disabled]')].find(
          (el) => el.children.length >= 2,
        ) ?? null)
    let titleBlock: Element | null = null
    let artistBlock: Element | null = null
    let durationCol: Element | null = null
    if (disabledHost && disabledHost.children.length >= 2) {
      const cols = [...disabledHost.children]
      const hasOnlyDuration = (col: Element) => durationPattern.test(col.textContent?.trim() ?? '')
      const hasOnlyMedia = (col: Element) =>
        Boolean(col.querySelector('img')) && !(col.textContent?.trim() ?? '')
      const metaCol =
        cols.find(
          (col) => !hasOnlyMedia(col) && !hasOnlyDuration(col) && col.textContent?.trim(),
        ) ?? cols[1]
      durationCol =
        cols.find((col) => col !== metaCol && hasOnlyDuration(col)) ??
        (cols.length >= 3 ? cols[cols.length - 1] : null)
      if (metaCol) {
        let inner: Element = metaCol
        while (inner.children.length === 1 && inner.firstElementChild?.tagName === 'DIV') {
          inner = inner.firstElementChild
        }
        if (inner.children.length >= 2) {
          titleBlock = inner.children[0]
          const second = inner.children[1]
          if (readSpacedText(second) || !second.querySelector('svg')) {
            artistBlock = second
          }
        } else {
          titleBlock = inner
        }
      }
    }
    return { disabledHost, titleBlock, artistBlock, durationCol }
  }
  const readRowTime = (node: HTMLElement, parts?: ReturnType<typeof rowStructure>): string => {
    const legacy =
      node
        .querySelector(
          '[data-testid="MusicTrackRow_Duration"], .audio_row__duration, .audio_item__duration',
        )
        ?.textContent?.trim() ?? ''
    if (durationPattern.test(legacy)) return legacy
    const { titleBlock, artistBlock, durationCol } = parts ?? rowStructure(node)
    if (durationCol) {
      if (durationCol.children.length === 0) {
        const direct = durationCol.textContent?.trim() ?? ''
        if (durationPattern.test(direct)) return direct
      }
      const inCol = [...durationCol.querySelectorAll('span, div')].find(
        (el) => el.children.length === 0 && durationPattern.test(el.textContent?.trim() ?? ''),
      )
      if (inCol) return inCol.textContent!.trim()
    }
    const leaves = [...node.querySelectorAll('span, div')].filter((el) => {
      if (el.children.length !== 0) return false
      if (el.closest('a')) return false
      if (titleBlock?.contains(el) || artistBlock?.contains(el)) return false
      return durationPattern.test(el.textContent?.trim() ?? '')
    })
    return leaves[leaves.length - 1]?.textContent?.trim() ?? ''
  }
  const read = (node: HTMLElement) => {
    let payload: unknown
    try {
      payload = JSON.parse(node.getAttribute('data-audio') ?? 'null')
    } catch {
      /* Visible fields remain usable. */
    }
    const tuple = Array.isArray(payload) ? payload : null
    const object = payload && !tuple ? (payload as Record<string, unknown>) : {}
    const text = (selectors: string) => node.querySelector(selectors)?.textContent?.trim() ?? ''
    let title =
      text(
        '[data-testid="MusicTrackRow_Title"], .audio_row__title, .audio_item__title, [class*="MusicTrackRow__title"]',
      ) || decode(tuple?.[3] ?? object.title)
    const subtitle = text(
      '[data-testid="MusicTrackRow_Subtitle"], .audio_row__subtitle, .audio_item__subtitle',
    )
    if (subtitle && !title.includes(subtitle)) title += ' ' + subtitle
    const authors = [...node.querySelectorAll('[data-testid="MusicTrackRow_Authors"]')]
    const group = authors[0]?.parentElement
    let artist =
      (authors.length > 1 &&
      group &&
      authors.every((author) => author.parentElement === group) &&
      !group.querySelector('[data-testid="MusicTrackRow_Title"]')
        ? group.textContent?.trim()
        : authors
            .map((author) => author.textContent?.trim())
            .filter(Boolean)
            .join(', ')) ||
      text(
        '.audio_row__performers, .audio_row__performer, .audio_item__performer, [class*="MusicTrackRow__authors"]',
      ) ||
      decode(
        tuple?.[4] ??
          object.artist ??
          object.performer ??
          (Array.isArray(object.main_artists)
            ? object.main_artists.map((item: { name?: string }) => item.name ?? '').join(', ')
            : ''),
      )
    const parts = rowStructure(node)
    if (!title) {
      const titleScope = parts.titleBlock ?? node
      const titleLink = [...titleScope.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => {
        const href = a.getAttribute('href') ?? ''
        return /^\/audio(?:-?\d+|[a-f0-9]+)/i.test(href) && !/[?&]performer=/.test(href)
      })
      if (titleLink) {
        title = readSpacedText(titleLink)
      } else if (parts.titleBlock) {
        const candidate = readSpacedText(parts.titleBlock)
        if (candidate && !durationPattern.test(candidate)) title = candidate
      }
    }
    if (!artist) {
      if (parts.artistBlock) {
        const candidate = readSpacedText(parts.artistBlock)
        if (candidate && !durationPattern.test(candidate)) artist = candidate
      }
      if (!artist) {
        const artistLinks = [
          ...(parts.artistBlock ?? node).querySelectorAll<HTMLAnchorElement>(
            'a[href^="/artist/"], a[href*="performer="]',
          ),
        ]
        if (artistLinks.length) {
          const parent = artistLinks[0].parentElement
          if (
            artistLinks.length > 1 &&
            parent &&
            artistLinks.every((a) => a.parentElement === parent) &&
            !parent.querySelector('a[href^="/audio"]:not([href*="performer="])')
          ) {
            artist = readSpacedText(parent)
          } else {
            artist = artistLinks
              .map((a) => readSpacedText(a))
              .filter(Boolean)
              .join(', ')
          }
        }
      }
    }
    const time = readRowTime(node, parts)
    const rawDuration = tuple?.[5] ?? object.duration
    const parsedDuration =
      rawDuration !== undefined &&
      rawDuration !== null &&
      (typeof rawDuration !== 'string' || rawDuration.trim() !== '')
        ? Number(rawDuration)
        : NaN
    const duration = durationPattern.test(time)
      ? time.split(':').reduce((total, part) => total * 60 + Number(part), 0)
      : Number.isFinite(parsedDuration) && parsedDuration >= 0
        ? parsedDuration
        : null
    const id =
      node.getAttribute('data-full-id') ||
      node.getAttribute('data-audio-id') ||
      (tuple?.[0] != null && tuple?.[1] != null
        ? `${tuple[1]}_${tuple[0]}`
        : object.id != null
          ? `${object.owner_id ?? ''}_${object.id}`
          : '')
    const position =
      Number((node.closest('[aria-posinset]') ?? node).getAttribute('aria-posinset')) || null
    const claimedSelector =
      '.audio_row__claimed, .audio_row_claimed, [data-testid*="Blocked"], [data-testid*="Claimed"]'
    const blocked =
      /blocked|unavailable|restricted|deleted|audio_claimed|audio_row_claimed|audio_row__claimed|audio_item_disabled/i.test(
        node.className,
      ) ||
      node.getAttribute('aria-disabled') === 'true' ||
      parts.disabledHost?.getAttribute('aria-disabled') === 'true' ||
      object.is_restricted === true ||
      object.is_deleted === true ||
      node.matches(claimedSelector) ||
      !!node.querySelector(claimedSelector)
    // VK replaces this cell's total duration with elapsed playback time for
    // the current recording, including when it is paused. It is no longer
    // duration evidence; matching title/artist (or ID) remains necessary.
    const hasElapsedOverlay =
      Boolean(
        node.querySelector(
          '[data-testid="MusicTrackRow_PlayerProgressBar"], [data-testid="MusicTrackCell_FrequencyBars"], [role="slider"], [role="progressbar"]',
        ),
      ) || isNodePlaying(node)
    return {
      node,
      id: String(id),
      title: normal(title),
      artist: normal(artist ?? ''),
      duration: hasElapsedOverlay ? null : duration,
      position,
      blocked,
    }
  }
  const shuffleButton = () => {
    for (const el of document.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
      if (
        !el.closest(excluded) &&
        !el.closest(rootSelector) &&
        visible(el) &&
        /перемешать|shuffle/i.test(el.textContent ?? '')
      ) {
        return el
      }
    }
    return null
  }
  const scopeSelectors = [
    '[data-testid="AudioCatalog_SectionMyTracks"]',
    '#au_search_items',
    '.audio_page__audio_rows_list',
    '[data-testid="MusicTracksList"]',
    '[data-testid="MusicTrackList"]',
  ]
  const rows = (customScope?: Element) => {
    const nodes = new Set<HTMLElement>()
    let scope: Element | Document = customScope ?? document
    if (!customScope) {
      for (const candidateSelector of scopeSelectors) {
        const candidate = document.querySelector(candidateSelector)
        if (candidate && candidate.querySelector(selector)) {
          scope = candidate
          break
        }
      }
    }
    const shuffleBtn = !customScope && scope === document ? shuffleButton() : null
    for (const element of scope.querySelectorAll<HTMLElement>(selector)) {
      const node = element.closest<HTMLElement>(rootSelector) ?? element
      if (node.closest(excluded) || !visible(node)) continue
      if (!customScope) {
        const sec = node.closest('section')
        if (
          sec &&
          /^(?:все треки|все плейлисты|all tracks|all playlists|недавно прослушанные|recently played)$/i.test(
            sectionHeadingText(sec),
          )
        ) {
          continue
        }
      }
      if (
        shuffleBtn &&
        node.compareDocumentPosition(shuffleBtn) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        continue
      }
      nodes.add(node)
    }
    const containers = new Set<HTMLElement>()
    for (const node of nodes) {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (nodes.has(parent)) containers.add(parent)
      }
    }
    return [...nodes].filter((node) => !containers.has(node)).map(read)
  }
  const targetId = /^-?\d+_\d+$/.test(track.id ?? '') ? track.id : ''
  const targetTitle = normal(track.title),
    targetArtist = normal(track.artist)
  const choose = (items: ReturnType<typeof rows>, playback = false) => {
    if (targetId) {
      const exact = items.find((item) => item.id === targetId)
      if (exact) return exact
    }
    const matches = items.filter(
      (item) =>
        (!targetId || !item.id) &&
        targetTitle &&
        targetArtist &&
        item.title === targetTitle &&
        item.artist === targetArtist &&
        (playback ||
          !(track.duration && item.duration) ||
          Math.abs(track.duration - item.duration) <= 2),
    )
    if (matches.length === 1) return matches[0]
    const byPos = matches.find((item) => track.position && item.position === track.position)
    if (byPos) return byPos
    if (playback && matches.length > 1) {
      const playingMatch = matches.find((item) => isNodePlaying(item.node))
      if (playingMatch) return playingMatch
    }
    if (matches.length > 1 && matches.every((item) => item.position === null)) {
      const nonEmptyIds = matches.map((item) => item.id).filter(Boolean)
      const sameId =
        nonEmptyIds.length === matches.length && nonEmptyIds.every((id) => id === nonEmptyIds[0])
      const durations = matches
        .map((item) => item.duration)
        .filter((value): value is number => value !== null)
      const consistentDuration =
        durations.length <= 1 || Math.max(...durations) - Math.min(...durations) <= 2
      if (sameId || consistentDuration) {
        return matches.find((item) => !item.blocked) ?? matches[0]
      }
    }
    return undefined
  }
  const signIn = () =>
    [
      ...document.querySelectorAll(
        'input[type="password"], #login_mobile, .login_form, .vkc__AuthRoot__content, [data-test-id="login-form"]',
      ),
    ].some(visible) ||
    /^(?:login|id)\.vk\./.test(location.hostname) ||
    location.pathname.startsWith('/join')
  const scrollerFor = (node?: HTMLElement): HTMLElement => {
    for (
      let parent = node?.parentElement;
      parent && parent !== document.body && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      if (
        parent.clientHeight > 0 &&
        parent.scrollHeight > parent.clientHeight + 8 &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      )
        return parent
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement
  }
  const findMusicSearchInput = (): HTMLInputElement | null => {
    const candidates = [
      ...document.querySelectorAll<HTMLInputElement>(
        '[data-testid="MusicSearchInput"], input#audio_search, input.audio_search__input, input[type="search"], input[type="text"]',
      ),
    ]
    return (
      candidates.find((input) => {
        if (!visible(input) || input.disabled || input.readOnly) return false
        if (input.closest('header, #page_header_cont, [role="banner"]')) return false
        if (
          input.matches('[data-testid="MusicSearchInput"], #audio_search, .audio_search__input')
        ) {
          return true
        }
        const hint = `${input.placeholder ?? ''} ${input.getAttribute('aria-label') ?? ''}`
        return /поиск музыки|поиск аудио|search music|search audio/i.test(hint)
      }) ?? null
    )
  }
  const findControlNearSearch = (input: HTMLInputElement, pattern: RegExp): HTMLElement | null => {
    let ancestor: HTMLElement | null = input.parentElement
    for (let depth = 0; depth < 6 && ancestor; depth++) {
      if (ancestor.getBoundingClientRect().height > 120) break
      const btn = [...ancestor.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
        (el) => {
          if (!visible(el)) return false
          const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.trim()
          return pattern.test(label)
        },
      )
      if (btn) return btn
      ancestor = ancestor.parentElement
    }
    const inputRect = input.getBoundingClientRect()
    return (
      [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find((el) => {
        if (!visible(el) || el.closest('header, #page_header_cont, [role="banner"]')) return false
        const rect = el.getBoundingClientRect()
        if (Math.abs(rect.top - inputRect.top) > 48) return false
        const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.trim()
        return pattern.test(label)
      }) ?? null
    )
  }
  const setSearchInputValue = (input: HTMLInputElement, value: string) => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const sectionHeadingText = (section: Element): string => {
    const heading = section.querySelector('h1, h2, h3, [role="heading"]')
    if (!heading || !visible(heading)) return ''
    const clone = heading.cloneNode(true) as Element
    clone.querySelectorAll('a, button').forEach((node) => node.remove())
    return (clone.textContent ?? '')
      .replace(/показать\s+все|show\s+all/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const findMyTracksSearchSection = (): Element | null =>
    [...document.querySelectorAll('section')].find(
      (section) =>
        visible(section) &&
        /^(?:мои треки|мои аудиозаписи|my tracks|my audio)$/i.test(sectionHeadingText(section)),
    ) ?? null
  const hasGlobalSearchSection = (): boolean =>
    [...document.querySelectorAll('section')].some(
      (section) =>
        visible(section) &&
        /^(?:все треки|все плейлисты|all tracks|all playlists)$/i.test(sectionHeadingText(section)),
    )
  const readPlayerState = (current: ReturnType<typeof read>) => {
    const legacyAdvert = firstVisible('[data-testid="AudioPlayerBlock_Advertising_Title"]')
    const legacyTitleEl = firstVisible('[data-testid="AudioPlayerBlock_AudioTitle"]')
    const legacyArtistEl =
      firstVisible('[data-testid="audioplayeraudioinfo-extra"]') ??
      firstVisible('[data-testid="AudioPlayerBlock_Authors"]')
    const legacyToggleEl = firstVisible('[data-testid="TopAudioPlayer_TogglePlayAction"]')
    const legacyTimerEl = firstVisible('[data-testid="AudioPlayerBlock_ProgressTimer"]')
    if (legacyTitleEl || legacyToggleEl || legacyAdvert) {
      const advertising = !!legacyAdvert && visible(legacyAdvert)
      const playerMatches =
        normal(legacyTitleEl?.textContent ?? '') === current.title &&
        normal(legacyArtistEl?.textContent ?? '') === current.artist
      const playerRunning =
        playerMatches && /приостановить|пауза|pause/i.test(legacyToggleEl?.textContent ?? '')
      const playerTimer = playerRunning ? legacyTimerEl?.textContent?.trim() : undefined
      return { advertising, playerRunning, playerTimer }
    }

    let bar: HTMLElement | null = null
    for (const nav of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      if (!visible(nav) || nav.closest('[aria-label="Аудиоплеер"]')) continue
      const label = `${nav.textContent ?? ''} ${nav.getAttribute('aria-label') ?? ''}`.trim()
      if (!/^(?:предыдущая аудиозапись|следующая аудиозапись|previous|next)/i.test(label)) continue
      let box: HTMLElement | null = nav.parentElement
      for (let depth = 0; depth < 8 && box; depth++) {
        const rect = box.getBoundingClientRect()
        if (rect.height > 140) break
        if (rect.width >= 400) {
          const hasToggle = [...box.querySelectorAll<HTMLElement>('button, [role="button"]')].some(
            (btn) => {
              if (!visible(btn)) return false
              const text = `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''}`.trim()
              return /^(?:пауза|приостановить|слушать|воспроизвести|play|pause)$/i.test(text)
            },
          )
          const hasPlayerCues =
            [...box.querySelectorAll('span, div')].some(
              (el) =>
                el.children.length === 0 && durationPattern.test(el.textContent?.trim() ?? ''),
            ) ||
            box.querySelector('a') !== null ||
            [...box.querySelectorAll<HTMLElement>('button, [role="button"]')].some((btn) =>
              /повторять|перемешку|выключить звук|repeat|shuffle|mute/i.test(
                `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''}`,
              ),
            )
          if (hasToggle && hasPlayerCues) {
            bar = box
            break
          }
        }
        box = box.parentElement
      }
      if (bar) break
    }

    const headerMini = firstVisible('[aria-label="Аудиоплеер"]') as HTMLElement | null
    const headerContainer = headerMini?.closest('li, div') ?? headerMini?.parentElement ?? null
    const headerToggle = headerContainer
      ? [...headerContainer.querySelectorAll<HTMLElement>('button')].find(
          (btn) =>
            visible(btn) &&
            /^(?:приостановить|пауза|воспроизвести|play|pause)$/i.test(
              `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''}`.trim(),
            ),
        )
      : null
    const headerRunning = Boolean(
      headerToggle &&
      /^(?:приостановить|пауза|pause)$/i.test(
        `${headerToggle.textContent ?? ''} ${headerToggle.getAttribute('aria-label') ?? ''}`.trim(),
      ),
    )
    const headerText = normal(headerMini?.textContent ?? '')
    const headerMatches =
      Boolean(current.title || current.artist) &&
      headerText === normal(`${current.artist} — ${current.title}`)

    let barRunning = false
    let barMatches = false
    let barTimer: string | undefined
    let advertising = false

    if (bar) {
      const barToggle = [...bar.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
        (btn) =>
          visible(btn) &&
          /^(?:пауза|приостановить|слушать|воспроизвести|play|pause)$/i.test(
            `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''}`.trim(),
          ),
      )
      barRunning = Boolean(
        barToggle &&
        /^(?:пауза|приостановить|pause)$/i.test(
          `${barToggle.textContent ?? ''} ${barToggle.getAttribute('aria-label') ?? ''}`.trim(),
        ),
      )
      const timerEl = [...bar.querySelectorAll('span, div')].find(
        (el) =>
          el.children.length === 0 &&
          visible(el) &&
          durationPattern.test(el.textContent?.trim() ?? ''),
      )
      barTimer = timerEl?.textContent?.trim()
      const barLinks = [...bar.querySelectorAll<HTMLAnchorElement>('a')].filter(visible)
      const titleLink =
        barLinks.find((a) => {
          const href = a.getAttribute('href') ?? ''
          return /^\/audio(?:-?\d+|[a-f0-9]+)/i.test(href) && !/[?&]performer=/.test(href)
        }) ?? barLinks[0]
      const artistLinks = barLinks.filter((a) => a !== titleLink)
      let barTitle = readSpacedText(titleLink)
      let barArtist = ''
      if (artistLinks.length === 1) {
        barArtist = readSpacedText(artistLinks[0])
      } else if (artistLinks.length > 1) {
        let artistContainer: HTMLElement | null = artistLinks[0].parentElement
        while (artistContainer && !artistLinks.every((a) => artistContainer!.contains(a))) {
          artistContainer = artistContainer.parentElement
        }
        barArtist =
          artistContainer && (!titleLink || !artistContainer.contains(titleLink))
            ? readSpacedText(artistContainer)
            : artistLinks
                .map((a) => readSpacedText(a))
                .filter(Boolean)
                .join(', ')
      }
      if (!barTitle || !barArtist) {
        const nonControlTexts = [...bar.querySelectorAll('span, div, a')]
          .filter(
            (el) =>
              el.children.length === 0 &&
              visible(el) &&
              !el.closest('button, [role="button"]') &&
              !durationPattern.test(el.textContent?.trim() ?? ''),
          )
          .map((el) => normal(el.textContent ?? ''))
          .filter(Boolean)
        if (!barTitle && current.title && nonControlTexts.includes(current.title)) {
          barTitle = current.title
        }
        if (!barArtist && current.artist && nonControlTexts.includes(current.artist)) {
          barArtist = current.artist
        }
      }
      barMatches =
        Boolean(current.title || current.artist) &&
        normal(barTitle) === current.title &&
        normal(barArtist) === current.artist
      if (barRunning && !barMatches) {
        advertising = [...bar.querySelectorAll('span, div, a')].some(
          (el) =>
            el.children.length === 0 &&
            visible(el) &&
            /^(?:реклама|отключить рекламу|advertising)$/i.test(el.textContent?.trim() ?? ''),
        )
      }
    }

    const playerRunning = bar ? barRunning && barMatches : headerRunning && headerMatches
    return {
      advertising,
      playerRunning,
      playerTimer: playerRunning ? barTimer : undefined,
    }
  }
  const startPlayback = async (
    found: ReturnType<typeof read>,
    activeScope?: Element,
  ): Promise<VKAudioResult | null> => {
    if (found.blocked)
      return fail('VK пометил эту запись как недоступную. Проверь её в «Моей музыке».')
    found.node.scrollIntoView({ block: 'nearest' })
    await sleep(120)
    if (cancelled()) return fail('Поиск оригинала VK отменён.')
    const current = choose(rows(activeScope))
    if (!current || !current.node.isConnected) return null
    if (current.blocked)
      return fail('VK пометил эту запись как недоступную. Проверь её в «Моей музыке».')
    // The real VK tap target wraps PlaybackControls. Clicking that decorative
    // child does not activate the player in the current VK interface.
    const button =
      current.node.querySelector<HTMLElement>('[data-testid="audiorow-tappable"]') ??
      current.node.querySelector<HTMLElement>(
        '.audio_row__play_btn, .audio_row__cover_back, [data-testid="MusicTrackRow_Play"], [role="button"][aria-label*="прослушивание" i], [role="button"][aria-label*="Воспроизвести" i], [role="button"][aria-label*="Продолжить" i], [role="button"][aria-label*="Слушать" i], [role="button"][aria-label*="Play" i], .audio_play',
      )
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause())
    const hasInitialVolume = typeof track.volume === 'number' && Number.isFinite(track.volume)
    let volumeApplied = hasInitialVolume ? applyInitialVolume(track.volume!) : true
    const baseline = new Map<HTMLMediaElement, number>()
    ;(button ?? current.node).click()
    let until = Date.now() + 15000
    const absoluteDeadline = Date.now() + 120000
    operation.message = 'Запись найдена. Ожидаем запуск плеера VK…'
    let firstElapsed: number | undefined
    let advertising = false
    while (Date.now() < until && Date.now() < absoluteDeadline) {
      if (cancelled()) return fail('Поиск оригинала VK отменён.')
      if (hasInitialVolume && !volumeApplied && applyInitialVolume(track.volume!)) {
        volumeApplied = true
      }
      const playerState = readPlayerState(current)
      advertising = playerState.advertising
      if (advertising) {
        operation.message = 'VK воспроизводит рекламу перед треком. Ожидаем оригинал…'
        firstElapsed = undefined
        baseline.clear()
        until = Date.now() + 15000
        await sleep(200)
        continue
      }
      operation.message = 'Запись найдена. Ожидаем начало воспроизведения VK…'
      const active = choose(rows(activeScope), true)
      const counter = playerState.playerRunning || Boolean(active && isNodePlaying(active.node))
      for (const media of document.querySelectorAll<HTMLMediaElement>('audio')) {
        // A pause icon, a selected row, audible ads or a 0:00 counter alone
        // do not establish successful playback of the requested original.
        const start = baseline.get(media)
        if (start === undefined || media.currentTime < start) baseline.set(media, media.currentTime)
        else if (
          counter &&
          !media.paused &&
          !media.ended &&
          media.readyState >= 2 &&
          media.currentTime > start + 0.15
        )
          return { playing: true }
      }
      const time =
        playerState.playerRunning && playerState.playerTimer
          ? playerState.playerTimer
          : active
            ? readRowTime(active.node)
            : undefined
      if (
        (active || playerState.playerRunning) &&
        time &&
        time !== '0:00' &&
        /^\d+:\d{2}$/.test(time)
      ) {
        // Some VK builds play through WebAudio and expose elapsed time only
        // in the active row. Require it to advance, not merely show a duration.
        const seconds = time.split(':').reduce((total, part) => total * 60 + Number(part), 0)
        if (
          counter &&
          firstElapsed !== undefined &&
          seconds > firstElapsed &&
          seconds - firstElapsed < 5
        )
          return { playing: true }
        if (counter && (firstElapsed === undefined || seconds < firstElapsed))
          firstElapsed = seconds
      }
      await sleep(150)
    }
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause())
    if (advertising)
      return fail(
        'VK не завершил рекламу за две минуты. Повтори прослушивание позже или открой плеер VK.',
      )
    return fail(
      'Запись найдена в «Моей музыке», но VK не начал воспроизведение. Проверь доступность записи и плеер в окне VK.',
    )
  }

  // Search the personal library, including in-page "Моя музыка" search and
  // virtual rows. The source position is only a seek hint: identity is always
  // checked again before any click, and global sections ("Все треки") are never used.
  const deadline = Date.now() + 45000
  let sawRows = false
  const readyDeadline = Date.now() + 3000
  while (Date.now() < readyDeadline) {
    if (cancelled()) return fail('Поиск оригинала VK отменён.')
    if (signIn()) return fail('Войди в VK в разделе «Подключения» и открой «Моя музыка».')
    const initialItems = rows()
    if (initialItems.length > 0) {
      sawRows = true
      break
    }
    if (findMusicSearchInput()) break
    await sleep(150)
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const immediate = choose(rows())
    if (!immediate) break
    const played = await startPlayback(immediate)
    if (played) return played
  }

  const searchInput = findMusicSearchInput()
  if (searchInput && (track.title.trim() || track.artist.trim())) {
    const qFull = [track.artist.trim(), track.title.trim()].filter(Boolean).join(' ')
    const qTitle = track.title.trim()
    const queries = qFull ? (qTitle && qTitle !== qFull ? [qFull, qTitle] : [qFull]) : [qTitle]
    let searchTouched = false
    for (const query of queries) {
      if (cancelled()) return fail('Поиск оригинала VK отменён.')
      if (signIn()) return fail('Войди в VK в разделе «Подключения» и открой «Моя музыка».')
      searchTouched = true
      setSearchInputValue(searchInput, query)
      await sleep(150)
      if (cancelled()) return fail('Поиск оригинала VK отменён.')
      const submitBtn = findControlNearSearch(searchInput, /^(?:найти|поиск|search)$/i)
      if (submitBtn) {
        submitBtn.click()
      } else {
        searchInput.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          }),
        )
      }
      await sleep(350)
      const queryDeadline = Date.now() + 4500
      let globalSeenAt = 0
      let expandedMyTracks = false
      while (Date.now() < queryDeadline && Date.now() < deadline) {
        if (cancelled()) return fail('Поиск оригинала VK отменён.')
        if (signIn()) return fail('Войди в VK в разделе «Подключения» и открой «Моя музыка».')
        const mySec = findMyTracksSearchSection()
        if (mySec) {
          sawRows = true
          const myItems = rows(mySec)
          for (let attempt = 0; attempt < 3; attempt++) {
            const hit = choose(rows(mySec))
            if (!hit) break
            const played = await startPlayback(hit, mySec)
            if (played) return played
          }
          if (!expandedMyTracks && myItems.length > 0) {
            const showAll = [
              ...mySec.querySelectorAll<HTMLElement>('a, button, [role="button"]'),
            ].find(
              (el) =>
                visible(el) && /^(?:показать все|show all)$/i.test((el.textContent ?? '').trim()),
            )
            if (showAll) {
              expandedMyTracks = true
              showAll.click()
              await sleep(250)
              continue
            }
          }
        }
        if (hasGlobalSearchSection()) {
          sawRows = true
          globalSeenAt ||= Date.now()
          const myItems = mySec ? rows(mySec) : []
          const hasShowAll = Boolean(
            mySec &&
            [...mySec.querySelectorAll<HTMLElement>('a, button, [role="button"]')].some(
              (el) =>
                visible(el) && /^(?:показать все|show all)$/i.test((el.textContent ?? '').trim()),
            ),
          )
          if (
            Date.now() - globalSeenAt >= 1500 &&
            (!mySec || (myItems.length > 0 && (!hasShowAll || expandedMyTracks)))
          ) {
            break
          }
        }
        await sleep(150)
      }
    }
    if (searchTouched) {
      const clearBtn = findControlNearSearch(searchInput, /очистить|clear/i)
      if (clearBtn) {
        clearBtn.click()
      } else {
        setSearchInputValue(searchInput, '')
        searchInput.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
          }),
        )
      }
      const clearDeadline = Date.now() + 2500
      while (Date.now() < clearDeadline && hasGlobalSearchSection()) {
        if (cancelled()) return fail('Поиск оригинала VK отменён.')
        await sleep(150)
      }
      if (hasGlobalSearchSection()) {
        return fail(
          'Запись не найдена в личной медиатеке VK. Проверь аккаунт, «Мою музыку» и актуальность исходного списка.',
        )
      }
    }
  }

  let scroller: HTMLElement | undefined
  let hintTried = false,
    scannedTop = false
  let endAt = 0,
    signature = ''
  while (Date.now() < deadline) {
    if (cancelled()) return fail('Поиск оригинала VK отменён.')
    if (signIn()) return fail('Войди в VK в разделе «Подключения» и открой «Моя музыка».')
    const items = rows()
    if (!items.length) {
      await sleep(200)
      continue
    }
    sawRows = true
    const found = choose(items)
    if (found) {
      const played = await startPlayback(found)
      if (played) return played
      continue
    }
    scroller ??= scrollerFor(items[0].node)
    if (!hintTried && track.position && track.position > 1) {
      hintTried = true
      const first = items[0]
      const height = first.node.getBoundingClientRect().height || 48
      scroller.scrollTop += (track.position - (first.position ?? 1)) * height
      await sleep(200)
      continue
    }
    if (!scannedTop) {
      scannedTop = true
      scroller.scrollTop = 0
      await sleep(200)
      continue
    }
    const nextSignature = JSON.stringify([
      items.map((item) => [item.id, item.title, item.artist, item.position]),
      scroller.scrollHeight,
      scroller.scrollTop,
    ])
    if (nextSignature !== signature) {
      signature = nextSignature
      endAt = 0
    }
    const before = scroller.scrollTop
    scroller.scrollTop += Math.max(100, scroller.clientHeight * 0.7)
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    if (
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body
    ) {
      window.dispatchEvent(new Event('scroll'))
    }
    if (Math.abs(scroller.scrollTop - before) < 1) {
      endAt ||= Date.now()
      if (Date.now() - endAt > 6000)
        return fail(
          'Запись не найдена в личной медиатеке VK. Проверь аккаунт, «Мою музыку» и актуальность исходного списка.',
        )
    } else {
      endAt = 0
    }
    await sleep(150)
  }
  return fail(
    sawRows
      ? 'Не удалось найти запись за 45 секунд. Личная медиатека VK подгружается медленно; повтори попытку или открой её в «Подключениях».'
      : 'VK не показал список личной музыки. Открой «Подключения → VK», войди и перейди в «Мою музыку».',
  )
}
