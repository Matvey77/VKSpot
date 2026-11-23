import { useDeferredValue, useMemo } from 'react'
import type { Collection, MatchingRules, TrackRow } from '../../../../shared/types'
import {
  analyzeRow,
  filterLibraryRows,
  summarizeCollection,
  type LibraryFilter,
} from '../../../../core/library'
import type { SearchResultGroup } from '../../../../core/matching'

export function useLibraryRows(
  collection: Collection | undefined,
  rules: MatchingRules,
  query: string,
  filter: LibraryFilter,
  resultFilter: 'all' | SearchResultGroup,
  selected: Set<string>,
) {
  const deferredQuery = useDeferredValue(query)
  const summary = useMemo(() => summarizeCollection(collection, rules), [collection, rules])
  const rowById = useMemo(() => {
    const map = new Map<string, TrackRow>()
    for (const row of collection?.rows ?? []) map.set(row.id, row)
    return map
  }, [collection?.rows])

  const filtered = useMemo(
    () => filterLibraryRows(collection, rules, deferredQuery, filter, resultFilter),
    [collection, rules, deferredQuery, filter, resultFilter],
  )
  const visibleIds = useMemo(() => new Set(filtered.rows.map((row) => row.id)), [filtered.rows])

  const selectedMatches = useMemo(() => {
    if (!selected.size || !rowById.size) return 0
    let count = 0
    if (selected.size < rowById.size) {
      for (const id of selected) {
        const row = rowById.get(id)
        if (row && analyzeRow(row, rules).group === 'exact') count++
      }
    } else {
      for (const row of collection?.rows ?? []) {
        if (selected.has(row.id) && analyzeRow(row, rules).group === 'exact') count++
      }
    }
    return count
  }, [collection?.rows, rowById, rules, selected])

  const hiddenSelected = useMemo(() => {
    if (!selected.size) return 0
    if (selected.size <= filtered.rows.length) {
      let hidden = 0
      for (const id of selected) {
        if (!visibleIds.has(id)) hidden++
      }
      return hidden
    }
    let visibleSelected = 0
    for (const row of filtered.rows) {
      if (selected.has(row.id)) visibleSelected++
    }
    return selected.size - visibleSelected
  }, [selected, filtered.rows, visibleIds])

  return { ...filtered, visibleIds, rowById, selectedMatches, hiddenSelected, summary }
}
