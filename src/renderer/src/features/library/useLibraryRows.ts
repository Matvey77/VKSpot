import { useDeferredValue, useMemo } from 'react'
import type { Collection, MatchingRules } from '../../../../shared/model'
import {
  analyzeRow,
  emptyGroups,
  summarizeCollection,
  type LibraryFilter,
} from '../../../../core/library'
import type { ReviewGroup } from '../../../../core/matching'

export function useLibraryRows(
  collection: Collection | undefined,
  rules: MatchingRules,
  query: string,
  filter: LibraryFilter,
  resultFilter: 'all' | ReviewGroup,
  selected: Set<string>,
) {
  const deferredQuery = useDeferredValue(query)
  const summary = useMemo(() => summarizeCollection(collection, rules), [collection, rules])
  const filtered = useMemo(() => {
    const text = deferredQuery.trim().toLocaleLowerCase()
    const counts = emptyGroups()
    const baseRows = [],
      rows = [],
      matchingRows = []
    for (const row of collection?.rows ?? []) {
      const item = analyzeRow(row, rules)
      if (
        filter !== 'all' &&
        (filter === 'blocked' ? row.source.availability !== 'blocked' : item.destination !== filter)
      )
        continue
      if (text && !item.search.includes(text)) continue
      baseRows.push(row)
      counts[item.group]++
      if (item.group === 'exact') matchingRows.push(row)
      if (resultFilter === 'all' || item.group === resultFilter) rows.push(row)
    }
    return { baseRows, rows, matchingRows, resultCounts: counts }
  }, [collection, rules, deferredQuery, filter, resultFilter])
  const selection = useMemo(() => {
    let selectedMatches = 0,
      visibleSelected = 0
    for (const row of collection?.rows ?? []) {
      if (selected.has(row.id) && analyzeRow(row, rules).group === 'exact') selectedMatches++
    }
    for (const row of filtered.rows) if (selected.has(row.id)) visibleSelected++
    return { selectedMatches, hiddenSelected: selected.size - visibleSelected }
  }, [collection, rules, selected, filtered.rows])
  return { ...filtered, ...selection, summary, deferredQuery }
}
