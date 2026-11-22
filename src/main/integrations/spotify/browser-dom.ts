// Runs in an isolated world. Reads only rendered search rows, never page state,
// credentials, cookies or Spotify's private network endpoints.
export function readSpotifySearch(query: string) {
  const text = document.body?.innerText ?? ''
  if (location.hostname !== 'open.spotify.com') return { kind: 'attention', tracks: [] }
  const path = location.pathname.split('/').filter(Boolean)
  const pathQuery = decodeURIComponent(path[1] ?? '')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cleanQuery = query
    .replace(/[\r\n\t\\]+/g, ' ')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    path[0] !== 'search' ||
    (pathQuery !== query &&
      pathQuery !== cleanQuery &&
      pathQuery.toLowerCase() !== cleanQuery.toLowerCase())
  )
    return { kind: 'loading', tracks: [] }
  const rows = [...document.querySelectorAll('[data-testid="tracklist-row"]')]
  if (
    [...document.querySelectorAll('iframe[src*="captcha"], [data-testid="challenge"]')].some(
      (element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.width > 150 &&
          bounds.height > 100 &&
          getComputedStyle(element).visibility !== 'hidden'
        )
      },
    ) ||
    (!rows.length &&
      /verify you are human|подтвердите, что вы человек|too many requests|слишком много запросов/i.test(
        text,
      ))
  )
    return { kind: 'attention', tracks: [] }
  if (!rows.length && /something went wrong|что-то пошло не так|не удалось загрузить/i.test(text))
    return { kind: 'error', tracks: [] }
  let incompleteTrackRow = false
  const tracks = rows.flatMap((row) => {
    const link = row.querySelector<HTMLAnchorElement>('a[href*="/track/"]')
    if (!link) return []
    const id = link.pathname.match(/^\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})$/)?.[1]
    const title = link.textContent?.trim()
    const artists = [...row.querySelectorAll<HTMLAnchorElement>('a[href*="/artist/"]')]
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean)
    const times = [...row.querySelectorAll('div, span')]
      .map((el) => el.textContent?.trim() ?? '')
      .filter((value) => /^(?:\d{1,2}:)?\d{1,3}:[0-5]\d$/.test(value))
    const time = times.at(-1)?.split(':').map(Number)
    if (!id || !title || !time || time.some(isNaN)) {
      incompleteTrackRow = true
      return []
    }
    const duration = time.reduce((total, part) => total * 60 + part, 0)
    return [
      {
        uri: 'spotify:track:' + id,
        title,
        artists: [...new Set(artists)],
        duration,
        url: 'https://open.spotify.com/track/' + id,
        album: row.querySelector('a[href*="/album/"]')?.textContent?.trim() ?? '',
      },
    ]
  })
  const unique = [...new Map(tracks.map((track) => [track.uri, track])).values()].slice(0, 10)
  if (incompleteTrackRow) return { kind: 'incomplete', tracks: [] }
  if (unique.length) return { kind: 'ready', tracks: unique }
  if (rows.length) return { kind: 'incomplete', tracks: [] }
  // Only an explicit completed no-results screen can establish an empty search.
  if (
    /(?:no\s+(?:results|tracks)\s+(?:found|for)|couldn't\s+find|spelled\s+correctly|ничего\s+не\s+(?:найдено|нашли)|(?:треки|треков|результаты|результатов)\s+не\s+найден[ыо]|не\s+удалось\s+найти|нет\s+ли\s+опечаток|перефразируй(?:те)?|keine\s+(?:ergebnisse|titel)|richtig\s+geschrieben|no\s+se\s+(?:han\s+)?encontraron|aucun\s+(?:résultat|titre))/i.test(
      text,
    )
  )
    return { kind: 'empty', tracks: [] }
  return { kind: 'loading', tracks: [] }
}

export type SpotifySearchDomResult = ReturnType<typeof readSpotifySearch>

export function readSpotifySearchScript(cleanQuery: string): string {
  return `(${readSpotifySearch.toString()})(${JSON.stringify(cleanQuery)})`
}
