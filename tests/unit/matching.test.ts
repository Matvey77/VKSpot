import { describe, expect, it } from 'vitest'
import { createCollection, makePlan, parseImport } from '../../src/core/collection'
import { metadataMatch, reviewGroup, searchText, spotifyTrackId } from '../../src/core/matching'
import { Store } from '../../src/main/store'
import type { SpotifyTrack, TrackRow } from '../../src/shared/model'
import { defaultMatchingRules } from '../../src/shared/model'

const candidate: SpotifyTrack = {
  uri: 'spotify:track:' + 'a'.repeat(22),
  title: 'Self Aware',
  artists: ['Temper City'],
  duration: 180,
  album: 'Self Aware',
  url: '',
}
function row(): TrackRow {
  const result = createCollection(
    parseImport(
      JSON.stringify([{ artist: 'Temper City', title: 'Self Aware', duration: 181 }]),
      '.json',
      'Test',
    ),
  ).rows[0]
  result.working.candidates = [candidate]
  result.working.searchedQuery = searchText(result.working)
  return result
}

describe('conservative metadata review', () => {
  it('keeps queries with an unreadable candidate artist in manual review', () => {
    const entry = row()
    entry.working.candidates.push({
      ...candidate,
      uri: 'spotify:track:' + 'b'.repeat(22),
      artists: [],
    })
    expect(metadataMatch(entry)).toBeNull()
    expect(reviewGroup(entry)).toBe('review')
  })
  it('groups a unique full metadata match and never treats a title alone as enough', () => {
    const entry = row()
    expect(reviewGroup(entry)).toBe('exact')
    entry.working.candidates = [{ ...candidate, artists: ['Another artist'] }]
    expect(reviewGroup(entry)).toBe('review')
    entry.working.candidates = [{ ...candidate, duration: 240 }]
    expect(reviewGroup(entry)).toBe('review')
    entry.working.candidates = [candidate]
    entry.source.duration = null
    expect(reviewGroup(entry)).toBe('exact')

    // Inconsistent duration candidates when source duration is unknown must still go to review
    entry.working.candidates = [
      candidate,
      { ...candidate, uri: 'spotify:track:' + 'd'.repeat(22), duration: 320 },
    ]
    expect(metadataMatch(entry)).toBeNull()
    expect(reviewGroup(entry)).toBe('review')
  })
  it('sends version mismatches, custom bracket tags and ambiguous recordings to review', () => {
    // When VK track is a remix/live/slowed version but Spotify candidate is an original release:
    for (const title of [
      'Self Aware (Remix)',
      'Self Aware [MY TAG]',
      'Self Aware slowed',
      'Self Aware (Live)',
      'Self Aware (Mash-up)',
      'Self Aware (Mash–Up)',
      'Self Aware (Мэшап)',
      'Self Aware (мешап)',
      'Self Aware (Speed Up)',
      'Self Aware (Speed-Up)',
      'Self Aware (spedup)',
      'Self Aware (Slow Down)',
      'Self Aware (Ускоренная версия)',
      'Self Aware (Замедленная)',
      'Self_Aware_RMX',
    ]) {
      const entry = row()
      entry.source.title = title
      entry.working.title = title
      entry.working.searchedQuery = searchText(entry.working)
      // Candidate does NOT have this remix/tag
      entry.working.candidates = [candidate]
      expect(metadataMatch(entry)).toBeNull()
      expect(reviewGroup(entry)).toBe('review')
    }
    const entry = row()
    entry.working.version = 'Festival set'
    expect(metadataMatch(entry)).toBeNull()
    entry.working.version = ''
    entry.working.candidates.push({ ...candidate, uri: 'spotify:track:' + 'b'.repeat(22) })
    expect(metadataMatch(entry)?.uri).toBe(candidate.uri)
    expect(reviewGroup(entry)).toBe('exact')

    // 5-second tolerance vs 6-second rejection
    entry.source.duration = 185 // 185 - 180 = 5s
    expect(metadataMatch(entry)).not.toBeNull()
    entry.source.duration = 186 // 186 - 180 = 6s
    expect(metadataMatch(entry)).toBeNull()

    // Closest duration is preferred when multiple candidates exist
    entry.source.duration = 180
    entry.working.candidates = [
      { ...candidate, uri: 'spotify:track:' + '1'.repeat(22), duration: 182 }, // diff 2s
      { ...candidate, uri: 'spotify:track:' + '2'.repeat(22), duration: 180 }, // diff 0s (exact)
    ]
    expect(metadataMatch(entry)?.uri).toBe('spotify:track:' + '2'.repeat(22))
  })
  it('automatically matches identical versions, homoglyphs, diacritics and featured artists', () => {
    const entry = row()

    // 1. Version in title matching identical version in candidate
    entry.working.title = 'Звуковой агрессор (2026 Version)'
    entry.working.artist = 'Кар-Мэн'
    entry.source.duration = 218
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Звуковой агрессор (2026 Version)',
        artists: ['Кар-Мэн'],
        duration: 218,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 2. Mix in title matching identical mix in candidate
    entry.working.title = 'Gobble Glitch - Blackgrass Glitch Mix'
    entry.working.artist = 'Backwoodz808'
    entry.source.duration = 223
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Gobble Glitch - Blackgrass Glitch Mix',
        artists: ['Backwoodz808'],
        duration: 223,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 3. Remix punctuation and remixer listed in candidate artists
    entry.working.title = 'FALLEN BALDSCUM remix'
    entry.working.artist = 'JEEMBO'
    entry.source.duration = 132
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'FALLEN (BALDSCUM remix)',
        artists: ['JEEMBO', 'BALDSCUM'],
        duration: 131,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 4. Remake punctuation (hyphen vs space)
    entry.working.title = 'sv moscow remake'
    entry.working.artist = 'королевский XVII'
    entry.source.duration = 143
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'sv moscow - remake',
        artists: ['королевский XVII'],
        duration: 143,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 5. Featured artist in title matching candidate artist list
    entry.working.title = 'ПОКАЖИ КОЗУ (feat. ICEGERGERT)'
    entry.working.artist = 'JEEMBO, ICEGERGERT'
    entry.source.duration = 147
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'ПОКАЖИ КОЗУ',
        artists: ['JEEMBO', 'Icegergert'],
        duration: 147,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 6. Diacritics (JAŸ-Z vs JAY-Z)
    entry.working.title = 'Umbrella'
    entry.working.artist = 'Rihanna, JAY-Z'
    entry.source.duration = 274
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Umbrella',
        artists: ['Rihanna', 'JAŸ-Z'],
        duration: 275,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 7. Homoglyphs (Latin MOT vs Russian МОТ)
    entry.working.title = 'Шадэ'
    entry.working.artist = 'By Индия, Xcho, MOT' // Latin MOT
    entry.source.duration = 169
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Шадэ',
        artists: ['By Индия', 'Xcho', 'МОТ'], // Russian МОТ
        duration: 168,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 8. Duration difference within 5s tolerance (4.01s diff)
    entry.working.title = 'Love Me'
    entry.working.artist = 'JMSN'
    entry.source.duration = 269
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Love Me',
        artists: ['JMSN'],
        duration: 273.01,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')
  })
  it('respects matchingRules toggles when rules are disabled', () => {
    const entry = row()
    // Homoglyphs disabled
    entry.working.title = 'Шадэ'
    entry.working.artist = 'By Индия, Xcho, MOT' // Latin MOT
    entry.source.duration = 169
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Шадэ',
        artists: ['By Индия', 'Xcho', 'МОТ'], // Russian МОТ
        duration: 169,
      },
    ]
    expect(metadataMatch(entry, { ...defaultMatchingRules, homoglyphs: false })).toBeNull()
    expect(reviewGroup(entry, { ...defaultMatchingRules, homoglyphs: false })).toBe('review')

    // Duration tolerance disabled (diff 4s > 2s default tolerance)
    entry.working.title = 'Love Me'
    entry.working.artist = 'JMSN'
    entry.source.duration = 269
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Love Me',
        artists: ['JMSN'],
        duration: 273,
      },
    ]
    expect(
      metadataMatch(entry, { ...defaultMatchingRules, extendedDurationTolerance: false }),
    ).toBeNull()

    // Diacritics disabled
    entry.working.title = 'Umbrella'
    entry.working.artist = 'Rihanna, JAY-Z'
    entry.source.duration = 274
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Umbrella',
        artists: ['Rihanna', 'JAŸ-Z'],
        duration: 274,
      },
    ]
    expect(metadataMatch(entry, { ...defaultMatchingRules, diacritics: false })).toBeNull()
  })
  it('distinguishes never searched, no results, deferred and a real file still needed', () => {
    const entry = row()
    entry.working.candidates = []
    expect(reviewGroup(entry)).toBe('missing')
    entry.working.searchedQuery = null
    expect(reviewGroup(entry)).toBe('pending')
    entry.working.reviewDeferred = true
    expect(reviewGroup(entry)).toBe('deferred')
    entry.working.localPending = true
    expect(reviewGroup(entry)).toBe('local-pending')
    const collection = createCollection(parseImport('A - B', '.txt', 'Test'))
    collection.rows[0].working.localPending = true
    expect(() => makePlan(collection)).toThrow('не готова')
  })
  it('confirms repeated occurrences atomically, preserves source and undoes the whole group', () => {
    const store = new Store(':memory:')
    try {
      const id = store.import(
        parseImport(
          JSON.stringify(
            Array.from({ length: 2 }, () => ({
              id: 'same',
              artist: 'Temper City',
              title: 'Self Aware',
              duration: 181,
            })),
          ),
          '.json',
          'Test',
        ),
      )
      const original = store.get(id)
      const ids = original.rows.map((entry) => entry.id)
      store.patch(
        id,
        ids,
        { candidates: [candidate], searchedQuery: 'Temper City Self Aware' },
        false,
      )
      expect(store.confirmMetadataMatches(id, ids)).toBe(2)
      expect(store.get(id).rows.map((entry) => entry.working.spotify?.uri)).toEqual([
        candidate.uri,
        candidate.uri,
      ])
      expect(store.get(id).rows.map((entry) => entry.source)).toEqual(
        original.rows.map((entry) => entry.source),
      )
      expect(store.undo(id)).toBe(true)
      expect(store.get(id).rows.every((entry) => entry.working.destination === 'unresolved')).toBe(
        true,
      )
      store.patch(id, [ids[1]], { candidates: [{ ...candidate, artists: ['Wrong'] }] }, false)
      expect(() => store.confirmMetadataMatches(id, ids)).toThrow('отдельной проверки')
      expect(store.row(id, ids[0]).working.destination).toBe('unresolved')
      store.patch(id, [ids[0]], { title: 'Another song' })
      expect(store.row(id, ids[0]).working.searchedQuery).toBeNull()
      expect(store.row(id, ids[0]).working.candidates).toEqual([])
    } finally {
      store.close()
    }
  })

  it('correctly extracts 22-char Spotify track IDs from URIs and URLs', () => {
    expect(spotifyTrackId('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT')
    expect(spotifyTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
      '4cOdK2wGLETKBW3PvgPWqT',
    )
    expect(
      spotifyTrackId('https://open.spotify.com/intl-ru/track/4cOdK2wGLETKBW3PvgPWqT?si=abc'),
    ).toBe('4cOdK2wGLETKBW3PvgPWqT')
    expect(spotifyTrackId('')).toBeNull()
    expect(spotifyTrackId(null)).toBeNull()
    expect(spotifyTrackId(undefined)).toBeNull()
    expect(spotifyTrackId('invalid:uri')).toBeNull()
  })
})
