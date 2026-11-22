import { describe, expect, it } from 'vitest'
import { createCollection, parseImport } from '../../src/core/collection'
import { defaultMatchingRules } from '../../src/shared/defaults'
import {
  analyzeRow,
  destinationLabels,
  filterLibraryRows,
  formatDuration,
  summarizeCollection,
} from '../../src/core/library'
import { searchResultLabels, searchText, type SearchResultGroup } from '../../src/core/matching'

function fixture() {
  const collection = createCollection(
    parseImport(
      Array.from({ length: 7 }, (_, i) => `Artist - Song ${i}`).join('\n'),
      '.txt',
      'Filters',
    ),
  )
  for (const row of collection.rows) {
    row.source.duration = 180
    row.working.searchedQuery = searchText(row.working)
    row.working.candidates = [
      {
        uri: 'spotify:track:' + 'a'.repeat(22),
        title: row.working.title,
        artists: ['Artist'],
        duration: 180,
        url: '',
        album: '',
      },
    ]
  }
  collection.rows[1].working.destination = 'spotify'
  collection.rows[1].working.spotify = collection.rows[1].working.candidates[0]
  collection.rows[2].working.excluded = true
  collection.rows[3].working.localPending = true
  collection.rows[4].working.reviewDeferred = true
  collection.rows[5].working.candidates = []
  collection.rows[5].source.availability = 'blocked'
  collection.rows[6].working.candidates = []
  collection.rows[6].working.searchedQuery = null
  return collection
}

describe('independent library filters', () => {
  it('retains search evidence after decisions, and matches text across title and artist fields', () => {
    const collection = fixture()
    const exact = filterLibraryRows(collection, defaultMatchingRules, 'Song Artist', 'all', 'exact')
    expect(exact.rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5])
    expect(exact.matchingIds).toEqual([collection.rows[0].id])
    expect(exact.destinationCounts).toMatchObject({
      all: 5,
      spotify: 1,
      excluded: 1,
      'local-pending': 1,
      deferred: 1,
    })
    expect(
      filterLibraryRows(collection, defaultMatchingRules, '', 'spotify', 'exact').rows,
    ).toEqual([collection.rows[1]])
    expect(
      filterLibraryRows(collection, defaultMatchingRules, '', 'excluded', 'exact').rows,
    ).toEqual([collection.rows[2]])
    expect(
      filterLibraryRows(collection, defaultMatchingRules, '', 'deferred', 'exact').rows,
    ).toEqual([collection.rows[4]])
    expect(
      filterLibraryRows(collection, defaultMatchingRules, '', 'blocked', 'missing').rows,
    ).toEqual([collection.rows[5]])
    expect(
      filterLibraryRows(collection, defaultMatchingRules, '', 'all', 'missing').matchingIds,
    ).toEqual([])
  })

  it('every facet count equals the actual row count after choosing that option', () => {
    const collection = fixture()
    const groups = ['all', ...Object.keys(searchResultLabels)] as ('all' | SearchResultGroup)[]
    for (const query of ['', 'Song 3', 'Artist Song', 'missing']) {
      for (const filter of Object.keys(destinationLabels) as (keyof typeof destinationLabels)[]) {
        for (const resultFilter of groups) {
          const result = filterLibraryRows(
            collection,
            defaultMatchingRules,
            query,
            filter,
            resultFilter,
          )
          for (const choice of Object.keys(
            destinationLabels,
          ) as (keyof typeof destinationLabels)[]) {
            expect(result.destinationCounts[choice]).toBe(
              filterLibraryRows(collection, defaultMatchingRules, query, choice, resultFilter).rows
                .length,
            )
          }
          for (const choice of groups) {
            expect(choice === 'all' ? result.baseCount : result.resultCounts[choice]).toBe(
              filterLibraryRows(collection, defaultMatchingRules, query, filter, choice).rows
                .length,
            )
          }
        }
      }
    }
  })

  it('counts summary.localPending consistently with destinations and excludes excluded rows', () => {
    const collection = createCollection(parseImport('A - One\nA - Two', '.txt', 'Summary'))
    collection.rows[0].working.localPending = true
    collection.rows[1].working.localPending = true
    collection.rows[1].working.excluded = true

    const summary = summarizeCollection(collection, defaultMatchingRules)
    expect(summary.localPending).toBe(1)
    expect(summary.destinations['local-pending']).toBe(1)
    expect(summary.destinations.excluded).toBe(1)
  })

  it('formats durations safely including invalid values and >= 1 hour tracks', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatDuration(-5)).toBe('—')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3599)).toBe('59:59')
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3900)).toBe('1:05:00')
  })

  it('computes lazy search across edited source.artist and Cyrillic/diacritic titles', () => {
    const collection = createCollection(
      parseImport(
        JSON.stringify([
          { artist: 'Original Кириллица', title: 'Йошкар-Ола', duration: 180 },
          { artist: 'JAŸ-Z', title: 'Café', duration: 200 },
        ]),
        '.json',
        'LazySearch',
      ),
    )
    collection.rows[0].working.artist = 'Edited Artist'

    // Empty-query pass and summary succeed before query filtering
    const summary = summarizeCollection(collection, defaultMatchingRules)
    expect(summary.destinations.all).toBe(2)
    expect(filterLibraryRows(collection, defaultMatchingRules, '', 'all', 'all').rows).toHaveLength(
      2,
    )

    // Filter by original source.artist even after working.artist changed
    const bySourceArtist = filterLibraryRows(
      collection,
      defaultMatchingRules,
      'кириллица',
      'all',
      'all',
    )
    expect(bySourceArtist.rows.map((r) => r.position)).toEqual([1])

    // Filter by working.title with Cyrillic й and diacritic NFKC/lowercase handling
    expect(
      filterLibraryRows(collection, defaultMatchingRules, 'йошкар', 'all', 'all').rows.map(
        (r) => r.position,
      ),
    ).toEqual([1])
    expect(
      filterLibraryRows(collection, defaultMatchingRules, 'café', 'all', 'all').rows.map(
        (r) => r.position,
      ),
    ).toEqual([2])
    expect(analyzeRow(collection.rows[0], defaultMatchingRules).search).toContain(
      'original кириллица',
    )
  })
})
