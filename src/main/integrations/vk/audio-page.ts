import type { VKAudioTrack, VKAudioResult } from './audio'

/** Public DOM only. Executed in an isolated world; no page globals or credentials are read. */
export function readVKLibraryLink(): string | null {
  const tab =
    document.querySelector<HTMLAnchorElement>('[data-testid="AudioCatalog_Tabs_Tab_all"]') ??
    [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/audios"]')].find((link) =>
      /моя музыка|мои аудиозаписи|my music|my audio/i.test(link.textContent ?? ''),
    )
  return tab?.href ?? null
}

/** Cancels the scanner before pausing; never clicks a control that can start playback. */
export function stopVKAudioPage(): void {
  const world = globalThis as typeof globalThis & { __VKSPOT_AUDIO__?: { cancelled: boolean } }
  if (world.__VKSPOT_AUDIO__) world.__VKSPOT_AUDIO__.cancelled = true
  const top = [
    ...document.querySelectorAll<HTMLElement>('[data-testid="TopAudioPlayer_TogglePlayAction"]'),
  ].find(
    (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden',
  )
  if (top && /приостановить|пауза|pause/i.test(top.textContent ?? '')) top.click()
  const pause = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="MusicTrackRow_Pause"], button[aria-label="Пауза"], button[aria-label="Pause"], .audio_row_playing .audio_row__play_btn',
    ),
  ].find((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  if (!top) pause?.click()
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause())
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
  const excluded =
    'aside, .audioPlaylistSnippet, [data-testid*="PlaylistSnippet"], [data-testid*="Recommendation"], [data-testid*="Recent"], [data-testid*="History"], [data-testid*="Friends"]'
  const rootSelector =
    '.audio_row, .audio_item, [data-testid="MusicTrackRow"], [class*="MusicTrackRow_root"], [class*="MusicTrackRow__root"]'
  const selector = rootSelector + ', [data-audio-id], [data-full-id], [data-audio]'
  const visible = (node: Element) => {
    const style = getComputedStyle(node)
    return (
      node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    )
  }
  const firstVisible = (selector: string) => [...document.querySelectorAll(selector)].find(visible)
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
    const artist =
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
    const time = text(
      '[data-testid="MusicTrackRow_Duration"], .audio_row__duration, .audio_item__duration',
    )
    const duration = /^\d+(?::\d{2}){1,2}$/.test(time)
      ? time.split(':').reduce((total, part) => total * 60 + Number(part), 0)
      : Number(tuple?.[5] ?? object.duration) || null
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
    const blocked =
      /blocked|unavailable|restricted|deleted|audio_claimed|audio_item_disabled/i.test(
        node.className,
      ) ||
      node.getAttribute('aria-disabled') === 'true' ||
      object.is_restricted === true ||
      object.is_deleted === true ||
      !!node.querySelector(
        '.audio_row__claimed, .audio_row_claimed, [data-testid*="Blocked"], [data-testid*="Claimed"]',
      )
    return {
      node,
      id: String(id),
      title: normal(title),
      artist: normal(artist ?? ''),
      // VK replaces this cell's total duration with elapsed playback time for
      // the current recording, including when it is paused. It is no longer
      // duration evidence; matching title/artist (or ID) remains necessary.
      duration: node.querySelector(
        '[data-testid="MusicTrackRow_PlayerProgressBar"], [data-testid="MusicTrackCell_FrequencyBars"]',
      )
        ? null
        : duration,
      position,
      blocked,
    }
  }
  const rows = () => {
    const nodes = new Set<HTMLElement>()
    const scope =
      document.querySelector(
        '[data-testid="AudioCatalog_SectionMyTracks"], #au_search_items, .audio_page__audio_rows_list, [data-testid="MusicTracksList"], [data-testid="MusicTrackList"]',
      ) ?? document
    for (const element of scope.querySelectorAll<HTMLElement>(selector)) {
      const node = element.closest<HTMLElement>(rootSelector) ?? element
      if (!node.closest(excluded) && visible(node)) nodes.add(node)
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
    return matches.find((item) => track.position && item.position === track.position)
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
    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      if (
        parent.scrollHeight > parent.clientHeight + 8 &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      )
        return parent
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement
  }

  // Search the personal library, including virtual rows. The source position is
  // only a seek hint: identity is always checked again before any click.
  const deadline = Date.now() + 45000
  let scroller: HTMLElement | undefined
  let hintTried = false,
    scannedTop = false
  let endAt = 0,
    signature = ''
  let sawRows = false
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
      if (found.blocked)
        return fail('VK пометил эту запись как недоступную. Проверь её в «Моей музыке».')
      found.node.scrollIntoView({ block: 'nearest' })
      await sleep(120)
      if (cancelled()) return fail('Поиск оригинала VK отменён.')
      const current = choose(rows())
      if (!current || !current.node.isConnected) continue
      if (current.blocked)
        return fail('VK пометил эту запись как недоступную. Проверь её в «Моей музыке».')
      // The real VK tap target wraps PlaybackControls. Clicking that decorative
      // child does not activate the player in the current VK interface.
      const button =
        current.node.querySelector<HTMLElement>('[data-testid="audiorow-tappable"]') ??
        current.node.querySelector<HTMLElement>(
          '.audio_row__play_btn, .audio_row__cover_back, [data-testid="MusicTrackRow_Play"], [role="button"][aria-label*="прослушивание"], [role="button"][aria-label*="Воспроизвести"], [role="button"][aria-label*="Play"], .audio_play',
        )
      document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => media.pause())
      const baseline = new Map<HTMLMediaElement, number>()
      ;(button ?? current.node).click()
      let until = Date.now() + 15000
      const absoluteDeadline = Date.now() + 120000
      operation.message = 'Запись найдена. Ожидаем запуск плеера VK…'
      let firstElapsed: number | undefined
      let advertising = false
      while (Date.now() < until && Date.now() < absoluteDeadline) {
        if (cancelled()) return fail('Поиск оригинала VK отменён.')
        const advert = firstVisible('[data-testid="AudioPlayerBlock_Advertising_Title"]')
        advertising = !!advert && visible(advert)
        if (advertising) {
          operation.message = 'VK воспроизводит рекламу перед треком. Ожидаем оригинал…'
          firstElapsed = undefined
          baseline.clear()
          until = Date.now() + 15000
          await sleep(200)
          continue
        }
        operation.message = 'Запись найдена. Ожидаем начало воспроизведения VK…'
        const active = choose(rows(), true)
        const playerTitle =
          firstVisible('[data-testid="AudioPlayerBlock_AudioTitle"]')?.textContent ?? ''
        const playerArtist =
          firstVisible('[data-testid="audioplayeraudioinfo-extra"]')?.textContent ??
          firstVisible('[data-testid="AudioPlayerBlock_Authors"]')?.textContent ??
          ''
        const playerMatches =
          normal(playerTitle) === current.title && normal(playerArtist) === current.artist
        const playerRunning =
          playerMatches &&
          /приостановить|пауза|pause/i.test(
            firstVisible('[data-testid="TopAudioPlayer_TogglePlayAction"]')?.textContent ?? '',
          )
        const counter =
          playerRunning ||
          (active &&
            (active.node.matches('[data-playing="1"], .audio_row_playing') ||
              active.node.querySelector('[data-testid="MusicTrackRow_Pause"]')))
        for (const media of document.querySelectorAll<HTMLMediaElement>('audio')) {
          // A pause icon, a selected row, audible ads or a 0:00 counter alone
          // do not establish successful playback of the requested original.
          const start = baseline.get(media)
          if (start === undefined || media.currentTime < start)
            baseline.set(media, media.currentTime)
          else if (
            counter &&
            !media.paused &&
            !media.ended &&
            media.readyState >= 2 &&
            media.currentTime > start + 0.15
          )
            return { playing: true }
        }
        const time = playerRunning
          ? firstVisible('[data-testid="AudioPlayerBlock_ProgressTimer"]')?.textContent?.trim()
          : active?.node
              .querySelector(
                '[data-testid="MusicTrackRow_Duration"], .audio_row__duration, .audio_item__duration',
              )
              ?.textContent?.trim()
        if ((active || playerRunning) && time && time !== '0:00' && /^\d+:\d{2}$/.test(time)) {
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
    scroller.dispatchEvent(new Event('scroll'))
    if (Math.abs(scroller.scrollTop - before) < 1) {
      endAt ||= Date.now()
      if (Date.now() - endAt > 2500)
        return fail(
          'Запись не найдена в личной медиатеке VK. Проверь аккаунт, «Мою музыку» и актуальность исходного списка.',
        )
    }
    await sleep(150)
  }
  return fail(
    sawRows
      ? 'Не удалось найти запись за 45 секунд. Личная медиатека VK подгружается медленно; повтори попытку или открой её в «Подключениях».'
      : 'VK не показал список личной музыки. Открой «Подключения → VK», войди и перейди в «Мою музыку».',
  )
}
