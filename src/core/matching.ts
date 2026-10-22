import { defaultMatchingRules } from '../shared/defaults'
import { type MatchingRules, type SpotifyTrack, type TrackRow, type Working } from '../shared/model'

export type ReviewGroup =
  'pending' | 'exact' | 'review' | 'missing' | 'local-pending' | 'deferred' | 'ready'
export type SearchResultGroup = 'pending' | 'exact' | 'review' | 'missing'
export const searchResultLabels: Record<SearchResultGroup, string> = {
  pending: 'Не искали',
  exact: 'Совпадают данные',
  review: 'Проверить версию',
  missing: 'Ничего не найдено',
}

export const reviewLabels: Record<ReviewGroup, string> = {
  pending: 'Не искали',
  exact: 'Совпадают данные',
  review: 'Проверить версию',
  missing: 'Ничего не найдено',
  'local-pending': 'Нужен файл',
  deferred: 'На потом',
  ready: 'Решено',
}

export const searchText = (working: Pick<Working, 'artist' | 'title' | 'version'>): string =>
  [working.artist, working.title, working.version].filter(Boolean).join(' ')

const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  х: 'x',
  у: 'y',
  і: 'i',
  ј: 'j',
}

function foldConfusables(s: string): string {
  return s.replace(/[авекмнорстхуіј]/g, (c) => HOMOGLYPHS[c] || c)
}

export const normalized = (value: string, rules: MatchingRules = defaultMatchingRules): string => {
  let res = value
  if (rules.diacritics) {
    res = res
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFKC')
  }
  res = res
    .toLocaleLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (rules.homoglyphs) {
    res = foldConfusables(res)
  }
  return res
}

export function extractFeatures(title: string): { baseTitle: string; featured: string[] } {
  const featured: string[] = []
  let base = title.replace(/\s*[([](?:feat\.?|ft\.?|with)\s+([^\])]+)[\])]/gi, (_, guests) => {
    featured.push(...guests.split(/\s*(?:,|&|;|\+)\s*/))
    return ''
  })
  base = base.replace(/\s+(?:feat\.?|ft\.?)\s+(.+)$/i, (_, guests) => {
    featured.push(...guests.split(/\s*(?:,|&|;|\+)\s*/))
    return ''
  })
  return { baseTitle: base.trim(), featured }
}

function artists(value: string[], rules: MatchingRules = defaultMatchingRules): string {
  return [
    ...new Set(
      value
        .flatMap((item) => item.split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i))
        .map((a) => normalized(a, rules))
        .filter(Boolean),
    ),
  ]
    .sort()
    .join('|')
}

export function hasVersionHint(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): boolean {
  return (
    Boolean(row.working.version.trim()) ||
    /\[[^\]]+\]|\b(remix|rmx|mix|edit|mash[\s-]*up|cover|live|sped[\s-]*up|sped|speed[\s-]*up|speedup|slowed|slow[\s-]*down|remaster(?:ed)?|instrumental|acoustic|rework|bootleg|vip|version)\b|ремикс|кавер|лайв|ремастер|м[эе]ш[\s-]*ап|ускоренн|замедленн|инструментал|акустич/i.test(
      normalized(
        [row.source.title, row.working.title, row.working.version].join(' '),
        rules,
      ).replace(/_/g, ' '),
    )
  )
}

const relaxPunctuation = (s: string) =>
  s
    .replace(/[()[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function candidateEvidence(
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules = defaultMatchingRules,
) {
  const rowFeat = rules.featDeduplication
    ? extractFeatures(row.working.title)
    : { baseTitle: row.working.title, featured: [] }
  const candFeat = rules.featDeduplication
    ? extractFeatures(candidate.title)
    : { baseTitle: candidate.title, featured: [] }

  const rowBaseArtists = artists([row.working.artist], rules)
  const rowAllArtists = artists([row.working.artist, ...rowFeat.featured], rules)
  const candBaseArtists = artists(candidate.artists, rules)
  const candAllArtists = artists([...candidate.artists, ...candFeat.featured], rules)

  const remixArtists = candidate.artists.map((a) => normalized(a, rules))
  const isRemixerInCandidate =
    row.working.title.toLowerCase().includes('remix') &&
    remixArtists.some((a) => normalized(row.working.title, rules).includes(a))

  const artistMatches =
    Boolean(row.working.artist.trim()) &&
    (rowBaseArtists === candBaseArtists ||
      rowAllArtists === candBaseArtists ||
      rowBaseArtists === candAllArtists ||
      rowAllArtists === candAllArtists ||
      isRemixerInCandidate)

  const rowNorm = normalized(row.working.title, rules)
  const candNorm = normalized(candidate.title, rules)
  const rowClean = normalized(rowFeat.baseTitle, rules)
  const candClean = normalized(candFeat.baseTitle, rules)

  const titleMatches =
    Boolean(row.working.title.trim()) &&
    (rowNorm === candNorm ||
      (rules.featDeduplication &&
        rowClean === candClean &&
        (rowFeat.featured.length > 0 || candFeat.featured.length > 0)) ||
      (rules.remixPunctuation && relaxPunctuation(rowNorm) === relaxPunctuation(candNorm)))

  return {
    artistMatches,
    titleMatches,
    durationDifference:
      row.source.duration === null ? null : Math.abs(row.source.duration - candidate.duration),
  }
}

export function hasVersionConflict(
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules = defaultMatchingRules,
): boolean {
  if (!rules.identicalVersions) return false

  if (row.working.version.trim()) {
    const vNorm = normalized(row.working.version, rules)
    const candTitleNorm = normalized(candidate.title, rules)
    const candAlbumNorm = normalized(candidate.album, rules)
    if (!candTitleNorm.includes(vNorm) && !candAlbumNorm.includes(vNorm)) return true
  }

  const customTagMatch = row.working.title.match(/\[([^\]]+)\]/)
  if (customTagMatch) {
    const tag = normalized(customTagMatch[1], rules)
    const isStandardVersion = /(?:remix|rmx|mix|edit|live|version|cover|remaster|prod)/i.test(tag)
    if (!isStandardVersion && !normalized(candidate.title, rules).includes(tag)) {
      return true
    }
  }

  const versionKeywords =
    /\b(remix|rmx|mix|edit|mash[\s-]*up|cover|live|sped[\s-]*up|sped|speed[\s-]*up|speedup|slowed|slow[\s-]*down|remaster(?:ed)?|instrumental|acoustic|rework|bootleg|vip)\b|ремикс|кавер|лайв|ремастер|м[эе]ш[\s-]*ап|ускоренн|замедленн|инструментал|акустич/i

  const rowMatches = normalized([row.source.title, row.working.title].join(' '), rules).match(
    versionKeywords,
  )
  if (rowMatches) {
    const keyword = rowMatches[0]
    const candText = normalized([candidate.title, candidate.album].join(' '), rules)
    if (!candText.includes(keyword)) {
      return true
    }
  }

  return false
}

export const MATCH_DURATION_TOLERANCE_SECONDS = 5

export function metadataMatch(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): SpotifyTrack | null {
  if (row.working.candidates.some((candidate) => !candidate.artists.length)) return null

  const tolerance = rules.extendedDurationTolerance ? MATCH_DURATION_TOLERANCE_SECONDS : 2

  if (row.source.duration !== null) {
    const matches: { candidate: SpotifyTrack; diff: number; index: number }[] = []
    for (let i = 0; i < row.working.candidates.length; i++) {
      const candidate = row.working.candidates[i]
      if (hasVersionConflict(row, candidate, rules)) continue
      const evidence = candidateEvidence(row, candidate, rules)
      if (
        evidence.artistMatches &&
        evidence.titleMatches &&
        evidence.durationDifference !== null &&
        evidence.durationDifference <= tolerance
      ) {
        matches.push({ candidate, diff: evidence.durationDifference, index: i })
      }
    }
    if (!matches.length) return null
    matches.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff
      const aLive = /live|лайв|concert|концерт/i.test(a.candidate.album) ? 1 : 0
      const bLive = /live|лайв|concert|концерт/i.test(b.candidate.album) ? 1 : 0
      if (aLive !== bLive) return aLive - bLive
      return a.index - b.index
    })
    return matches[0].candidate
  }

  // row.source.duration === null (unknown VK duration)
  const matches: { candidate: SpotifyTrack; index: number }[] = []
  for (let i = 0; i < row.working.candidates.length; i++) {
    const candidate = row.working.candidates[i]
    if (hasVersionConflict(row, candidate, rules)) continue
    const evidence = candidateEvidence(row, candidate, rules)
    if (evidence.artistMatches && evidence.titleMatches) {
      matches.push({ candidate, index: i })
    }
  }
  if (!matches.length) return null

  // Prioritize non-live/non-remix albums if available
  const regularMatches = matches.filter(
    (m) => !/live|лайв|concert|концерт|remix|rmx|ремикс/i.test(m.candidate.album),
  )
  const candidatePool = regularMatches.length ? regularMatches : matches

  // Verify that all candidate releases have consistent durations (within tolerance)
  const durations = candidatePool.map((m) => m.candidate.duration)
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)

  if (maxDuration - minDuration <= tolerance) {
    candidatePool.sort((a, b) => a.index - b.index)
    return candidatePool[0].candidate
  }

  return null
}

export function reviewGroup(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): ReviewGroup {
  const working = row.working
  if (working.excluded || working.destination !== 'unresolved') return 'ready'
  if (working.localPending) return 'local-pending'
  if (working.reviewDeferred) return 'deferred'
  return searchResultGroup(row, rules)
}

/** Search evidence is independent of inclusion and the user's destination decision. */
export function searchResultGroup(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): SearchResultGroup {
  const working = row.working
  const searched =
    working.searchedQuery === searchText(working) ||
    (working.searchedQuery === null && working.candidates.length > 0)
  if (!searched) return 'pending'
  if (!working.candidates.length) return 'missing'
  return metadataMatch(row, rules) ? 'exact' : 'review'
}

export function spotifyTrackId(uriOrUrl: string | null | undefined): string | null {
  if (!uriOrUrl) return null
  const match = uriOrUrl.match(/(?:spotify:track:|\/track\/)([A-Za-z0-9]{22})/)
  return match ? match[1] : null
}
