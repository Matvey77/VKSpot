import { defaultMatchingRules } from '../shared/defaults'
import { type Collection, type MatchingRules, type TrackRow } from '../shared/types'
import {
  reviewGroup,
  searchResultGroup,
  type SearchResultGroup,
  type ReviewGroup,
} from './matching'
import { hasNonAscii, matchingRulesMask } from './matching-normalize'

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
export const destinationStatus = (row: TrackRow): LibraryFilter =>
  row.working.excluded
    ? 'excluded'
    : row.working.localPending && row.working.destination === 'unresolved'
      ? 'local-pending'
      : row.working.reviewDeferred && row.working.destination === 'unresolved'
        ? 'deferred'
        : row.working.destination
export const formatDuration = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function normalizeSearchText(value: string): string {
  return hasNonAscii(value) ? value.normalize('NFKC').toLowerCase() : value.toLowerCase()
}

function buildRowSearch(row: TrackRow): string {
  const { working, source } = row
  const parts = [working.artist, working.title]
  if (working.version) parts.push(working.version)
  if (source.artist !== working.artist) parts.push(source.artist)
  if (source.title !== working.title) parts.push(source.title)
  if (source.id) parts.push(source.id)
  if (working.note) parts.push(working.note)
  return normalizeSearchText(parts.join('\u0000'))
}

export type AnalyzedRow = {
  group: ReviewGroup
  searchGroup: SearchResultGroup
  destination: LibraryFilter
  readonly search: string
}
const rowCache = new WeakMap<TrackRow, { key: number; result: AnalyzedRow }>()

/** Delta synchronization keeps these identities stable; only edited rows are recomputed. */
export function analyzeRow(
  row: TrackRow,
  rules: MatchingRules = defaultMatchingRules,
): AnalyzedRow {
  return analyzeRowWithKey(row, rules, matchingRulesMask(rules))
}

function analyzeRowWithKey(row: TrackRow, rules: MatchingRules, key: number): AnalyzedRow {
  const cache = rowCache.get(row)
  let result = cache?.key === key ? cache.result : undefined
  if (!result) {
    const group = reviewGroup(row, rules)
    let cachedSearch: string | null = null
    result = {
      group,
      searchGroup:
        group === 'ready' || group === 'local-pending' || group === 'deferred'
          ? searchResultGroup(row, rules)
          : group,
      destination: destinationStatus(row),
      get search() {
        if (cachedSearch === null) {
          cachedSearch = buildRowSearch(row)
        }
        return cachedSearch
      },
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
  const normalizedQuery = query.trim()
  const terms = normalizedQuery ? normalizeSearchText(normalizedQuery).split(/\s+/) : []
  const resultCounts: Record<SearchResultGroup, number> = {
    pending: 0,
    exact: 0,
    review: 0,
    missing: 0,
  }
  const destinationCounts = emptyDestinations()
  const key = matchingRulesMask(rules)
  let baseCount = 0
  const rows: TrackRow[] = []
  const matchingIds: string[] = []
  for (const row of collection?.rows ?? []) {
    const item = analyzeRowWithKey(row, rules, key)
    if (terms.length && !terms.every((term) => item.search.includes(term))) continue
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
      baseCount++
      resultCounts[item.searchGroup]++
    }
    if (matchesDestination && matchesResult) {
      rows.push(row)
      if (item.group === 'exact') matchingIds.push(row.id)
    }
  }
  return { baseCount, rows, matchingIds, resultCounts, destinationCounts }
}

export type CollectionSummary = {
  groups: Record<ReviewGroup, number>
  destinations: Record<LibraryFilter, number>
  unresolved: number
  localPending: number
}
const summaryCache = new WeakMap<TrackRow[], Map<number, CollectionSummary>>()

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
  const key = matchingRulesMask(rules)
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
      const item = analyzeRowWithKey(row, rules, key)
      result.groups[item.group]++
      result.destinations[item.destination]++
      if (row.source.availability === 'blocked') result.destinations.blocked++
      if (!row.working.excluded && row.working.destination === 'unresolved') result.unresolved++
      if (item.destination === 'local-pending') result.localPending++
    }
    cache.set(key, result)
  }
  return result
}
