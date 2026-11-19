import { useDeferredValue, useMemo } from 'react'
import type { Collection, MatchingRules } from '../../../../shared/model'
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
  const filtered = useMemo(
    () => filterLibraryRows(collection, rules, deferredQuery, filter, resultFilter),
    [collection, rules, deferredQuery, filter, resultFilter],
  )
  const selectedMatches = useMemo(() => {
    if (!selected.size) return 0
    let count = 0
    for (const row of collection?.rows ?? []) {
      if (selected.has(row.id) && analyzeRow(row, rules).group === 'exact') count++
    }
    return count
  }, [collection, rules, selected])
  const hiddenSelected = useMemo(() => {
    if (!selected.size) return 0
    let visibleSelected = 0
    for (const row of filtered.rows) if (selected.has(row.id)) visibleSelected++
    return selected.size - visibleSelected
  }, [selected, filtered.rows])
  return { ...filtered, selectedMatches, hiddenSelected, summary }
}
