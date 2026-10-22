import { defaultMatchingRules } from '../shared/defaults'
import { type Collection, type MatchingRules, type TrackRow } from '../shared/model'
import {
  reviewGroup,
  searchResultGroup,
  type SearchResultGroup,
  type ReviewGroup,
} from './matching'

export type LibraryFilter =
  'all' | 'unresolved' | 'spotify' | 'local' | 'local-pending' | 'deferred' | 'excluded' | 'blocked'
export const destinationLabels: Record<LibraryFilter, string> = {
  all: 'Все записи',
  unresolved: 'Нужен выбор',
  spotify: 'Spotify',
  local: 'Локальные',
  'local-pending': 'Нужен файл',
  deferred: 'На потом',
  excluded: 'Исключённые',
  blocked: 'Недоступные в VK',
}
export const emptyGroups = (): Record<ReviewGroup, number> => ({
  pending: 0,
  exact: 0,
  review: 0,
  missing: 0,
  'local-pending': 0,
  deferred: 0,
  ready: 0,
})
export const emptyDestinations = (): Record<LibraryFilter, number> => ({
  all: 0,
  unresolved: 0,
  spotify: 0,
  local: 0,
  'local-pending': 0,
  deferred: 0,
  excluded: 0,
  blocked: 0,
})
export const rulesKey = (rules: MatchingRules): string =>
  [
    rules.diacritics,
    rules.homoglyphs,
    rules.featDeduplication,
    rules.identicalVersions,
    rules.remixPunctuation,
    rules.extendedDurationTolerance,
  ]
    .map(Number)
    .join('')
export const destinationStatus = (row: TrackRow): LibraryFilter =>
  row.working.excluded
    ? 'excluded'
    : row.working.localPending && row.working.destination === 'unresolved'
      ? 'local-pending'
      : row.working.reviewDeferred && row.working.destination === 'unresolved'
        ? 'deferred'
        : row.working.destination
export const formatDuration = (seconds: number | null): string =>
  seconds === null
    ? '—'
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

type RowAnalysis = {
  group: ReviewGroup
  searchGroup: SearchResultGroup
  destination: LibraryFilter
  search: string
}
const rowCache = new WeakMap<TrackRow, { key: string; result: RowAnalysis }>()

/** Delta synchronization keeps these identities stable; only edited rows are recomputed. */
export function analyzeRow(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): RowAnalysis {
  const key = rulesKey(rules)
  const cache = rowCache.get(row)
  let result = cache?.key === key ? cache.result : undefined
  if (!result) {
    const group = reviewGroup(row, rules)
    result = {
      group,
      searchGroup:
        group === 'ready' || group === 'local-pending' || group === 'deferred'
          ? searchResultGroup(row, rules)
          : group,
      destination: destinationStatus(row),
      search: [
        row.working.artist,
        row.working.title,
        row.working.version,
        row.source.artist,
        row.source.title,
        row.source.id,
        row.working.note,
      ]
        .join('\u0000')
        .normalize('NFKC')
        .toLocaleLowerCase(),
    }
    rowCache.set(row, { key, result })
  }
  return result
}

/** Facet counts include the text query and the other facet, but not their own selection. */
export function filterLibraryRows(
  collection: Collection | undefined,
  rules: MatchingRules,
  query: string,
  filter: LibraryFilter,
  resultFilter: 'all' | SearchResultGroup,
) {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const resultCounts: Record<SearchResultGroup, number> = {
    pending: 0,
    exact: 0,
    review: 0,
    missing: 0,
  }
  const destinationCounts = emptyDestinations()
  const baseRows: TrackRow[] = [],
    rows: TrackRow[] = [],
    matchingRows: TrackRow[] = []
  for (const row of collection?.rows ?? []) {
    const item = analyzeRow(row, rules)
    if (!terms.every((term) => item.search.includes(term))) continue
    const matchesDestination =
      filter === 'all' ||
      (filter === 'blocked' ? row.source.availability === 'blocked' : item.destination === filter)
    const matchesResult = resultFilter === 'all' || item.searchGroup === resultFilter
    if (matchesResult) {
      destinationCounts.all++
      destinationCounts[item.destination]++
      if (row.source.availability === 'blocked') destinationCounts.blocked++
    }
    if (matchesDestination) {
      baseRows.push(row)
      resultCounts[item.searchGroup]++
    }
    if (matchesDestination && matchesResult) {
      rows.push(row)
      if (item.group === 'exact') matchingRows.push(row)
    }
  }
  return { baseRows, rows, matchingRows, resultCounts, destinationCounts }
}

export type CollectionSummary = {
  groups: Record<ReviewGroup, number>
  destinations: Record<LibraryFilter, number>
  unresolved: number
  localPending: number
}
const summaryCache = new WeakMap<TrackRow[], Map<string, CollectionSummary>>()

export function summarizeCollection(
  collection: Collection | undefined,
  rules: MatchingRules = defaultMatchingRules,
): CollectionSummary {
  if (!collection)
    return {
      groups: emptyGroups(),
      destinations: emptyDestinations(),
      unresolved: 0,
      localPending: 0,
    }
  let cache = summaryCache.get(collection.rows)
  if (!cache) {
    cache = new Map()
    summaryCache.set(collection.rows, cache)
  }
  const key = rulesKey(rules)
  let result = cache.get(key)
  if (!result) {
    result = {
      groups: emptyGroups(),
      destinations: emptyDestinations(),
      unresolved: 0,
      localPending: 0,
    }
    result.destinations.all = collection.rows.length
    for (const row of collection.rows) {
      const item = analyzeRow(row, rules)
      result.groups[item.group]++
      result.destinations[item.destination]++
      if (row.source.availability === 'blocked') result.destinations.blocked++
      if (!row.working.excluded && row.working.destination === 'unresolved') result.unresolved++
      if (row.working.localPending) result.localPending++
    }
    cache.set(key, result)
  }
  return result
}
