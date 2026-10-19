/* Metadata only, in an isolated world. No network requests, playback URLs,
 * hashes, cookies or page globals leave the page. See docs/vk-extraction.md. */
;(async () => {
  const state = {
    running: true,
    cancelled: false,
    collected: 0,
    expected: null,
    message: 'Возвращаемся к началу списка…',
  }
  globalThis.__VKSPOT_EXPORT__ = state
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const rowSelector =
    '.audio_row[data-full-id], .audio_row[data-audio], .audio_item[data-audio], [data-audio-id], [data-testid="MusicTrackRow"]'
  const excluded =
    '.audioPlaylistSnippet, [data-testid*="PlaylistSnippet"], [data-testid*="Recommendation"], aside'
  const originalURL = location.href
  let scope = document
  let scroller
  const saved = []
  const rowCache = new WeakMap()
  let expected = null
  let reason = 'end'

  function rows() {
    const nodes = new Set()
    for (const candidate of scope.querySelectorAll(rowSelector)) {
      if (candidate.closest(excluded)) continue
      const node =
        candidate.closest('.audio_row, .audio_item, [data-testid="MusicTrackRow"]') || candidate
      if (node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        nodes.add(node)
    }
    const containers = new Set()
    for (const item of nodes) {
      for (let parent = item.parentElement; parent; parent = parent.parentElement) {
        if (nodes.has(parent)) containers.add(parent)
      }
    }
    return [...nodes].filter((node) => !containers.has(node))
  }
  function plain(value) {
    if (typeof value !== 'string') return ''
    const template = document.createElement('template')
    template.innerHTML = value
    return (template.content.textContent || '').trim()
  }
  function text(node, selectors) {
    for (const selector of selectors) {
      const value = node.querySelector(selector)?.textContent?.trim()
      if (value) return value
    }
    return ''
  }
  function read(node) {
    const rawText = node.textContent || ''
    const stamp = JSON.stringify([
      node.getAttribute('data-audio'),
      node.getAttribute('data-full-id'),
      node.getAttribute('data-audio-id'),
      node.className,
      node.getAttribute('aria-disabled'),
      rawText,
    ])
    const cached = rowCache.get(node)
    if (cached?.stamp === stamp) return locate(node, { ...cached.track })
    let payload = null
    try {
      payload = JSON.parse(node.getAttribute('data-audio') || 'null')
    } catch {
      /* DOM fields remain available. */
    }
    const tuple = Array.isArray(payload)
    const object = payload && !tuple && typeof payload === 'object' ? payload : {}
    const payloadArtist = tuple
      ? payload[4]
      : object.artist ||
        object.performer ||
        (Array.isArray(object.main_artists)
          ? object.main_artists.map((a) => a.name).join(', ')
          : '')
    let title =
      text(node, [
        '[data-testid="MusicTrackRow_Title"]',
        '.audio_row__title',
        '.audio_item__title',
        '[class*="MusicTrackRow__title"]',
      ]) || plain(tuple ? payload[3] : object.title)
    const subtitle = text(node, [
      '[data-testid="MusicTrackRow_Subtitle"]',
      '.audio_row__subtitle',
      '.audio_item__subtitle',
    ])
    if (subtitle && !title.includes(subtitle)) title += ' ' + subtitle
    const authors = [...node.querySelectorAll('[data-testid="MusicTrackRow_Authors"]')]
    const authorGroup = authors[0]?.parentElement
    const modernArtist =
      authors.length > 1
        ? authorGroup &&
          authors.every((author) => author.parentElement === authorGroup) &&
          !authorGroup.querySelector('[data-testid="MusicTrackRow_Title"]')
          ? authorGroup.textContent.trim()
          : authors.map((author) => author.textContent.trim()).join(', ')
        : authors[0]?.textContent.trim()
    const artist =
      modernArtist ||
      text(node, [
        '.audio_row__performers',
        '.audio_row__performer',
        '.audio_item__performer',
        '[class*="MusicTrackRow__authors"]',
      ]) ||
      plain(payloadArtist)
    const time = text(node, [
      '[data-testid="MusicTrackRow_Duration"]',
      '.audio_row__duration',
      '.audio_item__duration',
    ])
    const seconds = tuple ? payload[5] : object.duration
    const duration = /^\d+(?::\d{2}){1,2}$/.test(time)
      ? time.split(':').reduce((sum, n) => sum * 60 + Number(n), 0)
      : Number.isFinite(Number(seconds)) && seconds !== null && seconds !== undefined
        ? Math.max(0, Number(seconds))
        : null
    const id =
      node.getAttribute('data-full-id') ||
      node.getAttribute('data-audio-id') ||
      (tuple && payload[0] != null && payload[1] != null
        ? `${payload[1]}_${payload[0]}`
        : object.id != null
          ? `${object.owner_id ?? ''}_${object.id}`
          : '')
    const blocked =
      /(?:blocked|unavailable|restricted|deleted|audio_claimed|audio_item_disabled)/i.test(
        node.className,
      ) ||
      node.getAttribute('aria-disabled') === 'true' ||
      object.is_restricted === true ||
      object.is_deleted === true
    const track = {
      id,
      artist,
      title: title.trim(),
      duration,
      availability: blocked ? 'blocked' : 'unknown',
      url: '',
      rawText,
    }
    rowCache.set(node, { stamp, track })
    return locate(node, { ...track })
  }
  function locate(node, track) {
    const positionNode = node.hasAttribute('aria-posinset') ? node : node.closest('[aria-posinset]')
    const position = Number(positionNode?.getAttribute('aria-posinset'))
    const rect = node.getBoundingClientRect()
    const offset =
      scroller === document.scrollingElement
        ? 0
        : scroller.getBoundingClientRect().top + scroller.clientTop
    return {
      track,
      key: track.id || JSON.stringify([track.artist, track.title, track.duration]),
      top: rect.top - offset + scroller.scrollTop,
      position: Number.isInteger(position) && position > 0 ? position : null,
      size: Number(node.getAttribute('aria-setsize')),
    }
  }
  function snapshot() {
    return rows()
      .map(read)
      .sort((a, b) => a.top - b.top)
  }
  function enrich(target, source) {
    if (!target.track.artist) target.track.artist = source.track.artist
    if (!target.track.title) target.track.title = source.track.title
    if (target.track.duration === null) target.track.duration = source.track.duration
    if (source.track.availability === 'blocked') target.track.availability = 'blocked'
    target.top = source.top
  }
  // Sequence + layout/ARIA anchors preserve individual occurrences. A Set of
  // audio IDs would remove repeats. Disconnected batches are never appended.
  function merge(current) {
    if (!current.length) return false
    if (!saved.length) {
      saved.push(...current)
      return true
    }
    const candidates = []
    for (let start = saved.length - 1; start >= 0; start--) {
      if (saved[start].key !== current[0].key) continue
      const anchored =
        current[0].position !== null && saved[start].position !== null
          ? current[0].position === saved[start].position
          : Math.abs(current[0].top - saved[start].top) <= 2
      candidates.push({ start, anchored })
    }
    const anchoredCandidates = candidates.filter((item) => item.anchored)
    const alignments = (anchoredCandidates.length ? anchoredCandidates : candidates).flatMap(
      ({ start, anchored }) => {
        const overlap = Math.min(current.length, saved.length - start)
        return current.slice(0, overlap).every((item, i) => saved[start + i].key === item.key)
          ? [{ start, overlap, anchored }]
          : []
      },
    )
    const anchored = alignments.filter((item) => item.anchored)
    const match =
      anchored.length === 1 ? anchored[0] : alignments.length === 1 ? alignments[0] : null
    if (!match) return false
    for (let i = 0; i < match.overlap; i++) enrich(saved[match.start + i], current[i])
    saved.push(...current.slice(match.overlap))
    return true
  }
  try {
    for (const selector of [
      '[data-testid="AudioCatalog_SectionMyTracks"]',
      '#au_search_items',
      '.audio_page__audio_rows_list',
      '[data-testid="MusicTracksList"]',
      '[data-testid="MusicTrackList"]',
    ]) {
      const candidates = [...document.querySelectorAll(selector)].filter((node) =>
        node.querySelector(rowSelector),
      )
      if (candidates.length) {
        scope = candidates.sort(
          (a, b) => b.querySelectorAll(rowSelector).length - a.querySelectorAll(rowSelector).length,
        )[0]
        break
      }
    }
    let first = rows()[0]
    for (let attempt = 0; !first && attempt < 30 && !state.cancelled; attempt++) {
      await pause(400)
      first = rows()[0]
    }
    if (!first)
      throw new Error(
        'Не найдены строки музыки. Откройте «Моя музыка» и дождитесь загрузки списка. Если список виден, разметка VK не поддерживается этой версией.',
      )
    let node = first.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
      if (
        node.clientHeight > 0 &&
        node.scrollHeight > node.clientHeight + 4 &&
        /auto|scroll/.test(getComputedStyle(node).overflowY)
      ) {
        scroller = node
        break
      }
      node = node.parentElement
    }
    scroller ||= document.scrollingElement
    if (!scroller) throw new Error('Не найдена область прокрутки списка VK.')
    scroller.scrollTo({ top: 0, behavior: 'instant' })
    await pause(800)
    let bottomSince = 0
    let lastTop = 0
    let retries = 0
    let lastProgressAt = Date.now()
    for (let pass = 0; pass < 12000; pass++) {
      if (state.cancelled) {
        reason = 'cancelled'
        break
      }
      if (location.href !== originalURL) {
        reason = 'page-changed'
        break
      }
      if (Date.now() - lastProgressAt > 2 * 60 * 1000) {
        reason = 'timeout'
        break
      }
      const current = snapshot()
      const sizes = new Set(
        current.map((row) => row.size).filter((size) => Number.isInteger(size) && size > 0),
      )
      if (sizes.size === 1) expected = [...sizes][0]
      const before = saved.length
      if (!merge(current)) {
        if (++retries > 4) {
          reason = 'gap'
          break
        }
        scroller.scrollTo({ top: lastTop, behavior: 'instant' })
        state.message = 'Ждём строки VK и проверяем непрерывность списка…'
        await pause(1000)
        continue
      }
      if (saved.length > before) {
        retries = 0
        lastProgressAt = Date.now()
      }
      state.collected = saved.length
      state.expected = expected
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
      if (!atBottom || saved.length !== before) bottomSince = 0
      if (atBottom && !bottomSince) bottomSince = Date.now()
      state.message = atBottom
        ? 'Ждём следующую порцию записей VK…'
        : 'Собираем список по порядку. Оставь окно VK открытым.'
      if (bottomSince && Date.now() - bottomSince >= 18000) break
      lastTop = scroller.scrollTop
      if (!atBottom)
        scroller.scrollTo({
          top: lastTop + Math.max(40, (scroller.clientHeight * 0.6) / (retries + 1)),
          behavior: 'instant',
        })
      await pause(atBottom ? 750 : 400)
      if (pass === 11999) reason = 'limit'
    }
    const tracks = saved.map((item) => item.track)
    if (!tracks.length) throw new Error('Сбор остановлен до чтения записей. Повторите выгрузку.')
    if (tracks.every((track) => !track.artist && !track.title))
      throw new Error(
        `VK показал ${tracks.length} строк, но названия и исполнители не прочитаны. Пустая выгрузка не сохранена. Нужен адаптер для этой разметки VK.`,
      )
    const missingMetadata = tracks.filter((track) => !track.artist || !track.title).length
    const positioned = saved.filter((item) => item.position !== null)
    if (
      positioned.length &&
      (positioned.length !== saved.length ||
        positioned.some((item, index) => item.position !== index + 1))
    )
      reason = 'gap'
    return {
      tracks,
      expectedCount: expected,
      extraction: { reason, missingMetadata, reachedEnd: reason === 'end' },
    }
  } finally {
    state.running = false
    state.message = 'Сбор остановлен.'
  }
})()
