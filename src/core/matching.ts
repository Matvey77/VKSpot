import { defaultMatchingRules } from '../shared/defaults'
import { type MatchingRules, type SpotifyTrack, type TrackRow, type Working } from '../shared/types'
import {
  BRACKET_TAG_RE,
  CYRILLIC_RE,
  CYRILLIC_VERSION_RE,
  FEAT_PREFIX_RE,
  LATIN_VERSION_RE,
  REMIX_CYRILLIC_RE,
  REMIX_LATIN_RE,
  STANDARD_TAG_RE,
  TRIM_VERSION_PUNCT_RE,
  WHITESPACE_RE,
  extractFeatures,
  extractVersionTokens,
  hasNonAscii,
  hasTokenPhrase,
  matchingRulesMask,
  normalizeForTranslit,
  normalizeTranslit,
  normalizeWithoutHomoglyphs,
  normalized,
  relaxPunctuation,
  splitArtistsList,
  transliterateRuToEn,
} from './matching-normalize'

export { normalized, extractFeatures, transliterateRuToEn } from './matching-normalize'

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

const RELAX_ARTIST_RE = /[\s\-._']/g
const relaxArtist = (s: string) => s.replace(RELAX_ARTIST_RE, '')

function artistPairMatchesRelaxed(
  left: string,
  leftRelaxed: string,
  right: string,
  rightRelaxed?: string,
): boolean {
  if (left === right) return true
  return Boolean(leftRelaxed) && leftRelaxed === (rightRelaxed ?? relaxArtist(right))
}

function transliteratedTitlesMatch(
  rowTitle: string,
  candidateTitle: string,
  rules: MatchingRules,
): boolean {
  if (rules.transliteration === false) return false
  if (!hasNonAscii(rowTitle) && !hasNonAscii(candidateTitle)) return false
  const rowHasCyrillic = CYRILLIC_RE.test(rowTitle)
  const candHasCyrillic = CYRILLIC_RE.test(candidateTitle)
  if (rowHasCyrillic === candHasCyrillic) return false

  const row = normalizeForTranslit(rowTitle, rules)
  const candidate = normalizeForTranslit(candidateTitle, rules)
  const rowIsCyrillic = CYRILLIC_RE.test(row)
  const candidateIsCyrillic = CYRILLIC_RE.test(candidate)
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

const EMPTY_SET = new Set<string>()
const EMPTY_TAGS: string[] = []

export type RowContext = {
  rowFeat: { baseTitle: string; featured: string[]; producers: string[] }
  rowWithFeaturedList: string[]
  rowWithFeaturedListRelaxed: string[]
  rowWithFeatured: string
  rowWithFeaturedRelaxed: string
  rowHasProducers: boolean
  rowAllArtists: string
  rowAllArtistsRelaxed: string
  rowNorm: string
  rowNormRelaxed: string
  rowWithVersionNorm: string
  rowWithVersionNormRelaxed: string
  rowFeatAndVersion: string
  rowFeatAndVersionNormRelaxed: string
  rowHasCredits: boolean
  rowBaseTitleNorm: string
  rowHasArtist: boolean
  rowHasTitle: boolean
  isRemixTitle: boolean
  remixCheckText: string
  rowVersionTokens: Set<string>
  strippedWorkingVersion: string
  customTags: string[]
  workingTitleTokens: Set<string>
  hasVersionRequirements: boolean
}

export function prepareRowContext(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): RowContext {
  const { working } = row
  const rowFeat = rules.featDeduplication
    ? extractFeatures(working.title)
    : { baseTitle: working.title, featured: [], producers: [] }

  const rowWithFeaturedList = splitArtistsList([working.artist, ...rowFeat.featured], rules)
  const rowWithFeaturedListRelaxed = rowWithFeaturedList.map(relaxArtist)
  const rowWithFeatured = rowWithFeaturedList.join('|')
  const rowWithFeaturedRelaxed = relaxArtist(rowWithFeatured)
  const rowHasProducers = rowFeat.producers.length > 0
  const rowAllArtists = rowHasProducers
    ? splitArtistsList([working.artist, ...rowFeat.featured, ...rowFeat.producers], rules).join('|')
    : rowWithFeatured
  const rowAllArtistsRelaxed = rowHasProducers ? relaxArtist(rowAllArtists) : rowWithFeaturedRelaxed

  const rowNorm = normalized(working.title, rules)
  const rowNormRelaxed = rules.remixPunctuation ? relaxPunctuation(rowNorm) : ''
  const versionTrimmed = working.version.trim()
  const rowTitleAndVersion = versionTrimmed ? `${working.title} ${versionTrimmed}` : ''
  const rowWithVersionNorm = rowTitleAndVersion ? normalized(rowTitleAndVersion, rules) : ''
  const rowWithVersionNormRelaxed =
    rowWithVersionNorm && rules.remixPunctuation ? relaxPunctuation(rowWithVersionNorm) : ''
  const rowFeatAndVersion =
    versionTrimmed && (rowFeat.featured.length > 0 || rowHasProducers)
      ? `${rowFeat.baseTitle} ${versionTrimmed}`
      : ''
  const rowFeatAndVersionNormRelaxed =
    rowFeatAndVersion && rules.remixPunctuation
      ? relaxPunctuation(normalized(rowFeatAndVersion, rules))
      : ''

  const rowHasCredits = rowFeat.featured.length > 0 || rowHasProducers
  const rowBaseTitleNorm =
    rowFeat.baseTitle === working.title ? rowNorm : normalized(rowFeat.baseTitle, rules)

  const rowTitleCyrillicNorm =
    rules.homoglyphs && hasNonAscii(working.title)
      ? normalizeWithoutHomoglyphs(working.title, rules)
      : rowNorm
  const isRemixTitle = REMIX_CYRILLIC_RE.test(rowTitleCyrillicNorm) || REMIX_LATIN_RE.test(rowNorm)
  const remixCheckText = rowWithVersionNorm || rowNorm

  let rowVersionTokens = EMPTY_SET
  let strippedWorkingVersion = ''
  let customTags = EMPTY_TAGS
  let workingTitleTokens = EMPTY_SET

  if (rules.identicalVersions) {
    if (versionTrimmed) {
      rowVersionTokens = extractVersionTokens(working.version, rules)
      const versionWithoutCyrillic = normalizeWithoutHomoglyphs(working.version, rules).replace(
        CYRILLIC_VERSION_RE,
        ' ',
      )
      strippedWorkingVersion = normalized(versionWithoutCyrillic, rules)
        .replace(LATIN_VERSION_RE, ' ')
        .replace(TRIM_VERSION_PUNCT_RE, '')
        .replace(WHITESPACE_RE, ' ')
        .trim()
    }
    if (working.title.includes('[')) {
      const collected: string[] = []
      for (const customTagMatch of working.title.matchAll(BRACKET_TAG_RE)) {
        const rawTag = customTagMatch[1]
        const tagTokens = extractVersionTokens(rawTag, rules)
        const tag = normalized(rawTag, rules)
        const isStandardTag =
          tagTokens.size > 0 ||
          STANDARD_TAG_RE.test(normalizeWithoutHomoglyphs(rawTag, rules)) ||
          (rules.featDeduplication && FEAT_PREFIX_RE.test(rawTag.trim()))
        if (!isStandardTag) {
          collected.push(tag)
        }
      }
      if (collected.length > 0) customTags = collected
    }
    workingTitleTokens = extractVersionTokens(working.title, rules, rowNorm)
  }

  const hasVersionRequirements =
    rowVersionTokens.size > 0 ||
    Boolean(strippedWorkingVersion) ||
    customTags.length > 0 ||
    workingTitleTokens.size > 0

  return {
    rowFeat,
    rowWithFeaturedList,
    rowWithFeaturedListRelaxed,
    rowWithFeatured,
    rowWithFeaturedRelaxed,
    rowHasProducers,
    rowAllArtists,
    rowAllArtistsRelaxed,
    rowNorm,
    rowNormRelaxed,
    rowWithVersionNorm,
    rowWithVersionNormRelaxed,
    rowFeatAndVersion,
    rowFeatAndVersionNormRelaxed,
    rowHasCredits,
    rowBaseTitleNorm,
    rowHasArtist: Boolean(working.artist.trim()),
    rowHasTitle: Boolean(working.title.trim()),
    isRemixTitle,
    remixCheckText,
    rowVersionTokens,
    strippedWorkingVersion,
    customTags,
    workingTitleTokens,
    hasVersionRequirements,
  }
}

function candidateEvidenceWithContext(
  ctx: RowContext,
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules,
  requireArtistForTitle: boolean,
  precomputedCandTitleNorm?: string,
) {
  const durationDifference =
    row.source.duration === null ? null : Math.abs(row.source.duration - candidate.duration)

  const candFeat = rules.featDeduplication
    ? extractFeatures(candidate.title)
    : { baseTitle: candidate.title, featured: [], producers: [] }

  let artistMatches = false
  if (ctx.rowHasArtist) {
    const candWithFeaturedList = splitArtistsList(
      [...candidate.artists, ...candFeat.featured],
      rules,
    )
    const candWithFeatured = candWithFeaturedList.join('|')
    const candWithFeaturedRelaxed = relaxArtist(candWithFeatured)
    const candHasProducers = candFeat.producers.length > 0
    const candAllArtists = candHasProducers
      ? splitArtistsList(
          [...candidate.artists, ...candFeat.featured, ...candFeat.producers],
          rules,
        ).join('|')
      : candWithFeatured
    const candAllArtistsRelaxed = candHasProducers
      ? relaxArtist(candAllArtists)
      : candWithFeaturedRelaxed

    const directArtistMatch =
      artistPairMatchesRelaxed(
        ctx.rowWithFeatured,
        ctx.rowWithFeaturedRelaxed,
        candWithFeatured,
        candWithFeaturedRelaxed,
      ) ||
      (ctx.rowHasProducers &&
        artistPairMatchesRelaxed(
          ctx.rowAllArtists,
          ctx.rowAllArtistsRelaxed,
          candWithFeatured,
          candWithFeaturedRelaxed,
        )) ||
      (candHasProducers &&
        artistPairMatchesRelaxed(
          ctx.rowWithFeatured,
          ctx.rowWithFeaturedRelaxed,
          candAllArtists,
          candAllArtistsRelaxed,
        )) ||
      (ctx.rowHasProducers &&
        candHasProducers &&
        artistPairMatchesRelaxed(
          ctx.rowAllArtists,
          ctx.rowAllArtistsRelaxed,
          candAllArtists,
          candAllArtistsRelaxed,
        ))

    if (directArtistMatch) {
      artistMatches = true
    } else if (
      ctx.isRemixTitle &&
      ctx.rowWithFeaturedList.length > 0 &&
      candWithFeaturedList.length > 0
    ) {
      const candRelaxedList = candWithFeaturedList.map(relaxArtist)
      const allRowArtistsMatched = ctx.rowWithFeaturedList.every((rowArtist, idx) =>
        candWithFeaturedList.some((candArtist, cIdx) =>
          artistPairMatchesRelaxed(
            rowArtist,
            ctx.rowWithFeaturedListRelaxed[idx],
            candArtist,
            candRelaxedList[cIdx],
          ),
        ),
      )
      if (allRowArtistsMatched) {
        let hasExtra = false
        let allExtrasInTitle = true
        for (let cIdx = 0; cIdx < candWithFeaturedList.length; cIdx++) {
          const candArtist = candWithFeaturedList[cIdx]
          const isRowArtist = ctx.rowWithFeaturedList.some((rowArtist, rIdx) =>
            artistPairMatchesRelaxed(
              rowArtist,
              ctx.rowWithFeaturedListRelaxed[rIdx],
              candArtist,
              candRelaxedList[cIdx],
            ),
          )
          if (!isRowArtist) {
            hasExtra = true
            if (!hasTokenPhrase(ctx.remixCheckText, candArtist)) {
              allExtrasInTitle = false
              break
            }
          }
        }
        artistMatches = hasExtra && allExtrasInTitle
      }
    }
  }

  if (requireArtistForTitle && !artistMatches) {
    return { artistMatches: false, titleMatches: false, durationDifference }
  }

  let titleMatches = false
  if (ctx.rowHasTitle) {
    const candNorm = precomputedCandTitleNorm ?? normalized(candidate.title, rules)
    const candHasCredits = candFeat.featured.length > 0 || candFeat.producers.length > 0
    const candBaseTitleNorm =
      candFeat.baseTitle === candidate.title ? candNorm : normalized(candFeat.baseTitle, rules)

    titleMatches =
      ctx.rowNorm === candNorm ||
      ((ctx.rowHasCredits || candHasCredits) && ctx.rowBaseTitleNorm === candBaseTitleNorm) ||
      (rules.remixPunctuation && ctx.rowNormRelaxed === relaxPunctuation(candNorm)) ||
      (Boolean(ctx.rowWithVersionNorm) &&
        (ctx.rowWithVersionNorm === candNorm ||
          (rules.remixPunctuation &&
            ctx.rowWithVersionNormRelaxed === relaxPunctuation(candNorm)))) ||
      (Boolean(ctx.rowFeatAndVersion) &&
        ((rules.remixPunctuation &&
          ctx.rowFeatAndVersionNormRelaxed === relaxPunctuation(candBaseTitleNorm)) ||
          transliteratedTitlesMatch(ctx.rowFeatAndVersion, candFeat.baseTitle, rules))) ||
      transliteratedTitlesMatch(ctx.rowFeat.baseTitle, candFeat.baseTitle, rules)
  }

  return {
    artistMatches,
    titleMatches,
    durationDifference,
  }
}

export function candidateEvidence(
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules = defaultMatchingRules,
) {
  return candidateEvidenceWithContext(prepareRowContext(row, rules), row, candidate, rules, false)
}

function hasVersionConflictWithContext(
  ctx: RowContext,
  candidate: SpotifyTrack,
  rules: MatchingRules,
): { conflict: boolean; candTitleNorm?: string } {
  if (!rules.identicalVersions || !ctx.hasVersionRequirements) return { conflict: false }

  const needTitleNorm = Boolean(ctx.strippedWorkingVersion) || ctx.customTags.length > 0
  const candTitleNorm = needTitleNorm ? normalized(candidate.title, rules) : undefined

  if (ctx.strippedWorkingVersion) {
    const candAlbumNorm = normalized(candidate.album, rules)
    if (
      !hasTokenPhrase(candTitleNorm!, ctx.strippedWorkingVersion) &&
      !hasTokenPhrase(candAlbumNorm, ctx.strippedWorkingVersion)
    ) {
      return { conflict: true }
    }
  }

  for (const tag of ctx.customTags) {
    if (!hasTokenPhrase(candTitleNorm!, tag)) return { conflict: true }
  }

  if (ctx.rowVersionTokens.size > 0 || ctx.workingTitleTokens.size > 0) {
    const candTitleTokens = extractVersionTokens(candidate.title, rules, candTitleNorm)
    let candAlbumTokens: Set<string> | undefined
    const hasToken = (token: string) => {
      if (candTitleTokens.has(token)) return true
      if (candAlbumTokens === undefined) {
        candAlbumTokens = extractVersionTokens(candidate.album, rules)
      }
      return candAlbumTokens.has(token)
    }

    for (const token of ctx.rowVersionTokens) {
      if (!hasToken(token)) return { conflict: true }
    }
    for (const token of ctx.workingTitleTokens) {
      if (!hasToken(token)) return { conflict: true }
    }
  }

  return { conflict: false, candTitleNorm }
}

export function hasVersionConflict(
  row: TrackRow,
  candidate: SpotifyTrack,
  rules: MatchingRules = defaultMatchingRules,
): boolean {
  if (!rules.identicalVersions) return false
  return hasVersionConflictWithContext(prepareRowContext(row, rules), candidate, rules).conflict
}

export const MATCH_DURATION_TOLERANCE_SECONDS = 5
const liveAlbum = /live|лайв|concert|концерт/i
const alternateAlbum = /live|лайв|concert|концерт|remix|rmx|ремикс/i

type CachedMetadataMatch = {
  working: Working
  artist: string
  title: string
  version: string
  candidates: SpotifyTrack[]
  candidatesLength: number
  sourceDuration: number | null
  result: SpotifyTrack | null
}
const metadataMatchCache = new WeakMap<TrackRow, Map<number, CachedMetadataMatch>>()

function computeMetadataMatch(row: TrackRow, rules: MatchingRules): SpotifyTrack | null {
  const { candidates } = row.working
  if (candidates.some((candidate) => !candidate.artists.length)) return null

  const tolerance = rules.extendedDurationTolerance ? MATCH_DURATION_TOLERANCE_SECONDS : 2

  if (row.source.duration !== null) {
    let closest: SpotifyTrack | null = null
    let closestDifference = Infinity
    let rowCtx: RowContext | undefined
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
      rowCtx ??= prepareRowContext(row, rules)
      const versionCheck = hasVersionConflictWithContext(rowCtx, candidate, rules)
      if (versionCheck.conflict) continue
      const evidence = candidateEvidenceWithContext(
        rowCtx,
        row,
        candidate,
        rules,
        true,
        versionCheck.candTitleNorm,
      )
      if (evidence.artistMatches && evidence.titleMatches) {
        closest = candidate
        closestDifference = difference
      }
    }
    return closest
  }

  const rowCtx = prepareRowContext(row, rules)
  const matches: SpotifyTrack[] = []
  for (const candidate of candidates) {
    const versionCheck = hasVersionConflictWithContext(rowCtx, candidate, rules)
    if (versionCheck.conflict) continue
    const evidence = candidateEvidenceWithContext(
      rowCtx,
      row,
      candidate,
      rules,
      true,
      versionCheck.candTitleNorm,
    )
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

export function metadataMatch(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): SpotifyTrack | null {
  const { working } = row
  if (!working.candidates.length) return null

  const mask = matchingRulesMask(rules)
  let byMask = metadataMatchCache.get(row)
  const cached = byMask?.get(mask)
  if (
    cached &&
    cached.working === working &&
    cached.artist === working.artist &&
    cached.title === working.title &&
    cached.version === working.version &&
    cached.candidates === working.candidates &&
    cached.candidatesLength === working.candidates.length &&
    cached.sourceDuration === row.source.duration
  ) {
    return cached.result
  }

  const result = computeMetadataMatch(row, rules)
  if (!byMask) {
    byMask = new Map()
    metadataMatchCache.set(row, byMask)
  }
  byMask.set(mask, {
    working,
    artist: working.artist,
    title: working.title,
    version: working.version,
    candidates: working.candidates,
    candidatesLength: working.candidates.length,
    sourceDuration: row.source.duration,
    result,
  })
  return result
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
