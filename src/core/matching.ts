import { defaultMatchingRules } from '../shared/defaults'
import { type MatchingRules, type SpotifyTrack, type TrackRow, type Working } from '../shared/types'

export type ReviewGroup =
  'pending' | 'exact' | 'review' | 'missing' | 'local-pending' | 'deferred' | 'ready'
export type SearchResultGroup = 'pending' | 'exact' | 'review' | 'missing'
export const searchResultLabels: Record<SearchResultGroup, string> = {
  pending: 'Не искали',
  exact: 'Совпадают данные',
  review: 'Проверить версию',
  missing: 'Ничего не найдено',
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

const TRANSLIT_RU_TO_EN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export function transliterateRuToEn(str: string): string {
  return str
    .replace(/дж/g, 'j')
    .replace(/кс/g, 'x')
    .replace(/щ/g, 'shch')
    .replace(/ш/g, 'sh')
    .replace(/ч/g, 'ch')
    .replace(/ж/g, 'zh')
    .replace(/х/g, 'kh')
    .replace(/ц/g, 'ts')
    .replace(/ю/g, 'yu')
    .replace(/я/g, 'ya')
    .replace(/ё/g, 'yo')
    .replace(/[а-яё]/g, (ch) => (TRANSLIT_RU_TO_EN[ch] !== undefined ? TRANSLIT_RU_TO_EN[ch] : ch))
}

const normalizeTranslit = (s: string) =>
  s
    .replace(/kh/g, 'h')
    .replace(/ya/g, 'ia')
    .replace(/yu/g, 'iu')
    .replace(/(?:iy|yy|ij)(?=\s|$)/g, 'y')

function foldConfusables(s: string): string {
  return s.replace(/[авекмнорстхуіј]/g, (c) => HOMOGLYPHS[c] || c)
}

function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) return true
  }
  return false
}

function normalizeInternal(value: string, rules: MatchingRules, preserveYo: boolean): string {
  const nonAscii = hasNonAscii(value)
  let res = value
  if (rules.diacritics && nonAscii) {
    const nfd = res.normalize('NFD')
    // Preserve Russian й/Й (distinct letter) and optionally ё/Ё for transliteration while stripping diacritics.
    res = (
      preserveYo
        ? nfd.replace(
            /([\u0418\u0438])\u0306|([\u0415\u0435])\u0308|[\u0300-\u036f]/g,
            (_match, yi: string | undefined, yo: string | undefined) =>
              yi
                ? yi === '\u0418'
                  ? '\u0419'
                  : '\u0439'
                : yo
                  ? yo === '\u0415'
                    ? '\u0401'
                    : '\u0451'
                  : '',
          )
        : nfd.replace(
            /([\u0418\u0438])\u0306|[\u0300-\u036f]/g,
            (_match, yi: string | undefined) => (yi ? (yi === '\u0418' ? '\u0419' : '\u0439') : ''),
          )
    ).normalize('NFKC')
  }
  res = res
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (rules.homoglyphs && nonAscii) {
    res = foldConfusables(res)
  }
  return res
}

export const normalized = (value: string, rules: MatchingRules = defaultMatchingRules): string =>
  normalizeInternal(value, rules, false)

export function extractFeatures(title: string): {
  baseTitle: string
  featured: string[]
  producers: string[]
} {
  const featured: string[] = []
  const producers: string[] = []
  let base = title

  const splitArtists = (s: string) => s.split(/\s*(?:,|&|;|\+|\s+[xX]\s+)\s*/)

  base = base.replace(/\s*[([](?:feat\.?|ft\.?|with)\s+([^\])]+)[\])]/gi, (_, guests) => {
    featured.push(...splitArtists(guests))
    return ''
  })
  base = base.replace(
    /\s*[([](?:prod\.?|produced|beat)\s*(?:by\s+)?([^\])]+)[\])]/gi,
    (_, prods) => {
      producers.push(...splitArtists(prods))
      return ''
    },
  )
  base = base.replace(
    /\s+(?:feat\.?|ft\.?)\s+(.+?)(?=\s*[([\]]|\s+[-–—]\s+|\s+(?:prod\.?|produced|beat)\b|$)/gi,
    (_, guests) => {
      featured.push(...splitArtists(guests))
      return ''
    },
  )
  base = base.replace(
    /\s+(?:prod\.?|produced|beat)\s+(?:by\s+)?(.+?)(?=\s*[([\]]|\s+[-–—]\s+|\s+(?:feat\.?|ft\.?)\b|$)/gi,
    (_, prods) => {
      producers.push(...splitArtists(prods))
      return ''
    },
  )
  return {
    baseTitle: base.trim(),
    featured: featured.map((s) => s.trim()).filter(Boolean),
    producers: producers.map((s) => s.trim()).filter(Boolean),
  }
}

function splitArtistsList(value: string[], rules: MatchingRules = defaultMatchingRules): string[] {
  return [
    ...new Set(
      value
        .flatMap((item) => item.split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i))
        .map((a) => normalized(a, rules))
        .filter(Boolean),
    ),
  ].sort()
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function hasTokenPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false
  const prefix = /^[\p{L}\p{N}]/u.test(phrase) ? '(?:^|[^\\p{L}\\p{N}])' : ''
  const suffix = /[\p{L}\p{N}]$/u.test(phrase) ? '(?=$|[^\\p{L}\\p{N}])' : ''
  return new RegExp(`${prefix}${escapeRegExp(phrase)}${suffix}`, 'u').test(haystack)
}

const LATIN_VERSION_RE =
  /(?:^|[^\p{L}\p{N}])(remix|rmx|mix|edit|mash[\s-]*up|cover|live|sped[\s-]*up|sped|speed[\s-]*up|speedup|slowed|slow[\s-]*down|remaster(?:ed)?|instrumental|acoustic|rework|bootleg|vip)(?=$|[^\p{L}\p{N}])/giu

const CYRILLIC_VERSION_RE =
  /(?:^|[^\p{L}\p{N}])(ремикс\p{L}*|кавер|лайв|ремастер\p{L}*|м[эе]ш[\s-]*ап\p{L}*|ускоренн\p{L}*|замедленн\p{L}*|инструментал\p{L}*|акусти(?:ч|к)\p{L}*)(?=$|[^\p{L}\p{N}])/giu

function canonicalVersionToken(raw: string): string {
  if (/^(?:remix|rmx|ремикс)/u.test(raw)) return 'remix'
  if (/^(?:cover|кавер)/u.test(raw)) return 'cover'
  if (/^(?:live|лайв)/u.test(raw)) return 'live'
  if (/^(?:remaster|ремастер)/u.test(raw)) return 'remaster'
  if (/^(?:mash|м[эе]ш)/u.test(raw)) return 'mashup'
  if (/^(?:sped|speed|ускоренн)/u.test(raw)) return 'sped_up'
  if (/^(?:slow|замедленн)/u.test(raw)) return 'slowed'
  if (/^(?:instrumental|инструментал)/u.test(raw)) return 'instrumental'
  if (/^(?:acoustic|акусти)/u.test(raw)) return 'acoustic'
  return raw
}

function extractVersionTokens(text: string, rules: MatchingRules): Set<string> {
  const tokens = new Set<string>()
  const latinNorm = normalized(text, rules)
  for (const match of latinNorm.matchAll(LATIN_VERSION_RE)) {
    tokens.add(canonicalVersionToken(match[1]))
  }
  const cyrillicNorm = rules.homoglyphs
    ? normalized(text, { ...rules, homoglyphs: false })
    : latinNorm
  for (const match of cyrillicNorm.matchAll(CYRILLIC_VERSION_RE)) {
    tokens.add(canonicalVersionToken(match[1]))
  }
  return tokens
}

const relaxPunctuation = (s: string) =>
  s
    .replace(/[()[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function transliteratedTitlesMatch(rowTitle: string, candidateTitle: string, rules: MatchingRules) {
  if (rules.transliteration === false) return false
  const rawRules = { ...rules, homoglyphs: false }
  const row = normalizeInternal(rowTitle, rawRules, true)
  const candidate = normalizeInternal(candidateTitle, rawRules, true)
  const rowIsCyrillic = /[а-яё]/i.test(row)
  const candidateIsCyrillic = /[а-яё]/i.test(candidate)
  if (rowIsCyrillic === candidateIsCyrillic) return false
  const cyrillic = rowIsCyrillic ? row : candidate
  const latin = rowIsCyrillic ? candidate : row
  const variants = cyrillic.includes('ё')
    ? [transliterateRuToEn(cyrillic), transliterateRuToEn(cyrillic.replace(/ё/g, 'е'))]
    : [transliterateRuToEn(cyrillic)]
  const matchesLatin = (transliterated: string) => {
    if (
      transliterated === latin ||
      normalizeTranslit(transliterated) === normalizeTranslit(latin)
    ) {
      return true
    }
    if (!rules.remixPunctuation) return false
    const relaxedTranslit = relaxPunctuation(transliterated)
    const relaxedLatin = relaxPunctuation(latin)
    return (
      relaxedTranslit === relaxedLatin ||
      normalizeTranslit(relaxedTranslit) === normalizeTranslit(relaxedLatin)
    )
  }
  return variants.some(matchesLatin)
}

const relaxArtist = (s: string) => s.replace(/[\s\-._']/g, '')
const equivalentArtist = (left: string, right: string) => {
  const relaxed = relaxArtist(left)
  return Boolean(relaxed) && relaxed === relaxArtist(right)
}

export function candidateEvidence(
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules = defaultMatchingRules,
) {
  const rowFeat = rules.featDeduplication
    ? extractFeatures(row.working.title)
    : { baseTitle: row.working.title, featured: [], producers: [] }
  const candFeat = rules.featDeduplication
    ? extractFeatures(candidate.title)
    : { baseTitle: candidate.title, featured: [], producers: [] }

  const rowWithFeaturedList = splitArtistsList([row.working.artist, ...rowFeat.featured], rules)
  const rowWithFeatured = rowWithFeaturedList.join('|')
  const rowHasProducers = rowFeat.producers.length > 0
  const rowAllArtists = rowHasProducers
    ? splitArtistsList([row.working.artist, ...rowFeat.featured, ...rowFeat.producers], rules).join(
        '|',
      )
    : rowWithFeatured

  const candWithFeaturedList = splitArtistsList([...candidate.artists, ...candFeat.featured], rules)
  const candWithFeatured = candWithFeaturedList.join('|')
  const candHasProducers = candFeat.producers.length > 0
  const candAllArtists = candHasProducers
    ? splitArtistsList(
        [...candidate.artists, ...candFeat.featured, ...candFeat.producers],
        rules,
      ).join('|')
    : candWithFeatured

  const rowNorm = normalized(row.working.title, rules)
  const candNorm = normalized(candidate.title, rules)
  const versionTrimmed = row.working.version.trim()
  const rowTitleAndVersion = versionTrimmed ? `${row.working.title} ${versionTrimmed}` : ''
  const rowWithVersionNorm = rowTitleAndVersion ? normalized(rowTitleAndVersion, rules) : ''
  const rowFeatAndVersion =
    versionTrimmed && (rowFeat.featured.length > 0 || rowHasProducers)
      ? `${rowFeat.baseTitle} ${versionTrimmed}`
      : ''

  const artistPairMatches = (left: string, right: string) =>
    left === right || equivalentArtist(left, right)

  const isRemixTitle =
    /(?:^|[^\p{L}\p{N}])(?:remix|rmx|ремикс\p{L}*)(?=$|[^\p{L}\p{N}])/iu.test(
      normalized(row.working.title, { ...rules, homoglyphs: false }),
    ) || /(?:^|[^\p{L}\p{N}])(?:remix|rmx)(?=$|[^\p{L}\p{N}])/iu.test(rowNorm)

  const remixCheckText = rowWithVersionNorm || rowNorm
  const remixArtistMatches =
    isRemixTitle &&
    rowWithFeaturedList.length > 0 &&
    candWithFeaturedList.length > 0 &&
    rowWithFeaturedList.every((rowArtist) =>
      candWithFeaturedList.some((candArtist) => artistPairMatches(candArtist, rowArtist)),
    ) &&
    (() => {
      const extraArtists = candWithFeaturedList.filter(
        (candArtist) =>
          !rowWithFeaturedList.some((rowArtist) => artistPairMatches(candArtist, rowArtist)),
      )
      return (
        extraArtists.length > 0 &&
        extraArtists.every((extraArtist) => hasTokenPhrase(remixCheckText, extraArtist))
      )
    })()

  const artistMatches =
    Boolean(row.working.artist.trim()) &&
    (artistPairMatches(rowWithFeatured, candWithFeatured) ||
      (rowHasProducers && artistPairMatches(rowAllArtists, candWithFeatured)) ||
      (candHasProducers && artistPairMatches(rowWithFeatured, candAllArtists)) ||
      (rowHasProducers && candHasProducers && artistPairMatches(rowAllArtists, candAllArtists)) ||
      remixArtistMatches)

  const rowHasCredits = rowFeat.featured.length > 0 || rowHasProducers
  const candHasCredits = candFeat.featured.length > 0 || candHasProducers
  const rowBaseTitleNorm = normalized(rowFeat.baseTitle, rules)
  const candBaseTitleNorm = normalized(candFeat.baseTitle, rules)

  const titleMatches =
    Boolean(row.working.title.trim()) &&
    (rowNorm === candNorm ||
      ((rowHasCredits || candHasCredits) && rowBaseTitleNorm === candBaseTitleNorm) ||
      (rules.remixPunctuation && relaxPunctuation(rowNorm) === relaxPunctuation(candNorm)) ||
      (Boolean(rowWithVersionNorm) &&
        (rowWithVersionNorm === candNorm ||
          (rules.remixPunctuation &&
            relaxPunctuation(rowWithVersionNorm) === relaxPunctuation(candNorm)))) ||
      (Boolean(rowFeatAndVersion) &&
        ((rules.remixPunctuation &&
          relaxPunctuation(normalized(rowFeatAndVersion, rules)) ===
            relaxPunctuation(candBaseTitleNorm)) ||
          transliteratedTitlesMatch(rowFeatAndVersion, candFeat.baseTitle, rules))) ||
      transliteratedTitlesMatch(rowFeat.baseTitle, candFeat.baseTitle, rules))

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

  const candTitleNorm = normalized(candidate.title, rules)
  const candAlbumNorm = normalized(candidate.album, rules)
  const candTokens = extractVersionTokens(`${candidate.title} ${candidate.album}`, rules)

  if (row.working.version.trim()) {
    const versionTokens = extractVersionTokens(row.working.version, rules)
    for (const token of versionTokens) {
      if (!candTokens.has(token)) return true
    }
    const strippedVersion = normalized(
      normalized(row.working.version, { ...rules, homoglyphs: false }).replace(
        CYRILLIC_VERSION_RE,
        ' ',
      ),
      rules,
    )
      .replace(LATIN_VERSION_RE, ' ')
      .replace(/^[()[\]\-–—\s]+|[()[\]\-–—\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (
      strippedVersion &&
      !hasTokenPhrase(candTitleNorm, strippedVersion) &&
      !hasTokenPhrase(candAlbumNorm, strippedVersion)
    ) {
      return true
    }
  }

  for (const customTagMatch of row.working.title.matchAll(/\[([^\]]+)\]/g)) {
    const rawTag = customTagMatch[1]
    const tagTokens = extractVersionTokens(rawTag, rules)
    const tag = normalized(rawTag, rules)
    const isStandardTag =
      tagTokens.size > 0 ||
      /(?:^|[^\p{L}\p{N}])(?:version|prod\.?|produced|beat|версия)(?=$|[^\p{L}\p{N}])/iu.test(
        normalized(rawTag, { ...rules, homoglyphs: false }),
      ) ||
      (rules.featDeduplication && /^(?:feat\.?|ft\.?|with)\s+/i.test(rawTag.trim()))
    if (!isStandardTag && !hasTokenPhrase(candTitleNorm, tag)) {
      return true
    }
  }

  // Only inspect working.title so user-corrected titles are not blocked by stale tags in source.title.
  for (const token of extractVersionTokens(row.working.title, rules)) {
    if (!candTokens.has(token)) return true
  }

  return false
}

export const MATCH_DURATION_TOLERANCE_SECONDS = 5
const liveAlbum = /live|лайв|concert|концерт/i
const alternateAlbum = /live|лайв|concert|концерт|remix|rmx|ремикс/i

export function metadataMatch(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): SpotifyTrack | null {
  const { candidates } = row.working
  if (candidates.some((candidate) => !candidate.artists.length)) return null

  const tolerance = rules.extendedDurationTolerance ? MATCH_DURATION_TOLERANCE_SECONDS : 2

  if (row.source.duration !== null) {
    let closest: SpotifyTrack | null = null
    let closestDifference = Infinity
    for (const candidate of candidates) {
      const difference = Math.abs(row.source.duration - candidate.duration)
      const withinTolerance = Math.round(difference) <= tolerance
      if (!withinTolerance || difference > closestDifference) continue
      // At equal distance, replace a live release with a studio release and preserve search order otherwise.
      if (
        closest &&
        difference === closestDifference &&
        (!liveAlbum.test(closest.album) || liveAlbum.test(candidate.album))
      )
        continue
      if (hasVersionConflict(row, candidate, rules)) continue
      const evidence = candidateEvidence(row, candidate, rules)
      if (evidence.artistMatches && evidence.titleMatches) {
        closest = candidate
        closestDifference = difference
      }
    }
    return closest
  }

  const matches: SpotifyTrack[] = []
  for (const candidate of candidates) {
    if (hasVersionConflict(row, candidate, rules)) continue
    const evidence = candidateEvidence(row, candidate, rules)
    if (evidence.artistMatches && evidence.titleMatches) matches.push(candidate)
  }
  if (!matches.length) return null

  // Prioritize non-live/non-remix albums if available
  const regularMatches = matches.filter((candidate) => !alternateAlbum.test(candidate.album))
  const candidatePool = regularMatches.length ? regularMatches : matches

  // Verify that all candidate releases have consistent durations (within tolerance)
  let minDuration = Infinity
  let maxDuration = -Infinity
  for (const candidate of candidatePool) {
    minDuration = Math.min(minDuration, candidate.duration)
    maxDuration = Math.max(maxDuration, candidate.duration)
  }
  return maxDuration - minDuration <= tolerance ? candidatePool[0] : null
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
