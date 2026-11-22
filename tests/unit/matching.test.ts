import { describe, expect, it } from 'vitest'
import { createCollection, makePlan, parseImport } from '../../src/core/collection'
import {
  extractFeatures,
  hasVersionConflict,
  metadataMatch,
  reviewGroup,
  searchText,
} from '../../src/core/matching'
import { Store } from '../../src/main/storage'
import { defaultMatchingRules } from '../../src/shared/defaults'
import type { SpotifyTrack, TrackRow } from '../../src/shared/types'

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
  it('prefers the first studio release when equally close releases are available', () => {
    const entry = row()
    const live = { ...candidate, uri: 'spotify:track:' + 'b'.repeat(22), album: 'Live' }
    const second = { ...candidate, uri: 'spotify:track:' + 'c'.repeat(22) }
    entry.working.candidates = [live, candidate, second]
    expect(metadataMatch(entry)).toBe(candidate)

    entry.source.duration = null
    live.duration = 260
    expect(metadataMatch(entry)).toBe(candidate)
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

    // 9. Producer credits in VK title (Prod. by ..., prod. by ...)
    entry.working.title = 'Мейхана Флоу Prod. by Wex, JXRD'
    entry.working.artist = 'Heronwater, Джон Гарик'
    entry.source.duration = 129
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Мейхана Флоу',
        artists: ['Heronwater', 'Джон Гарик'],
        duration: 129,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    entry.working.title = 'Баня prod. by djcodenwar'
    entry.working.artist = 'GORILLA GLU, LIL NAKU, FLOCKAA'
    entry.source.duration = 148
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Баня',
        artists: ['GORILLA GLU', 'LIL NAKU', 'FLOCKAA'],
        duration: 148.048,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 10. Bilingual transliteration (Cyrillic На Заре ↔ Latin Na Zare)
    entry.working.title = 'На Заре'
    entry.working.artist = 'Альянс, Братство Атома, BassnPanda, Atomic Heart'
    entry.source.duration = 210
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Na Zare',
        artists: ['Альянс', 'Братство Атома', 'BassnPanda', 'Atomic Heart'],
        duration: 210.218,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')

    // 11. Artist spacing and punctuation relaxation (Big Bang ↔ BIGBANG)
    entry.working.title = 'Bang Bang Bang'
    entry.working.artist = 'Big Bang'
    entry.source.duration = 215
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'BANG BANG BANG',
        artists: ['BIGBANG'],
        duration: 220.177,
      },
    ]
    expect(metadataMatch(entry)).not.toBeNull()
    expect(reviewGroup(entry)).toBe('exact')
  })
  it('respects matchingRules toggles when rules are disabled', () => {
    const entry = row()

    // Transliteration disabled
    entry.working.title = 'На Заре'
    entry.working.artist = 'Альянс'
    entry.source.duration = 210
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Na Zare',
        artists: ['Альянс'],
        duration: 210,
      },
    ]
    expect(metadataMatch(entry, { ...defaultMatchingRules, transliteration: false })).toBeNull()
    expect(reviewGroup(entry, { ...defaultMatchingRules, transliteration: false })).toBe('review')

    // Feat / Prod deduplication disabled
    entry.working.title = 'Мейхана Флоу Prod. by Wex, JXRD'
    entry.working.artist = 'Heronwater, Джон Гарик'
    entry.source.duration = 129
    entry.working.searchedQuery = searchText(entry.working)
    entry.working.candidates = [
      {
        ...candidate,
        title: 'Мейхана Флоу',
        artists: ['Heronwater', 'Джон Гарик'],
        duration: 129,
      },
    ]
    expect(metadataMatch(entry, { ...defaultMatchingRules, featDeduplication: false })).toBeNull()
    expect(reviewGroup(entry, { ...defaultMatchingRules, featDeduplication: false })).toBe('review')
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

  it('detects Russian version markers under default homoglyphs/diacritics and aligns RU/EN version pairs', () => {
    for (const ruTitle of [
      'Self Aware (Ремикс)',
      'Self Aware (Кавер)',
      'Self Aware (Лайв)',
      'Self Aware (Ускоренная)',
      'Self Aware (Замедленная)',
      'Self Aware (Ремастер)',
      'Self Aware (Акустическая)',
      'Self Aware (Инструментал)',
      'Self Aware (Мэшап)',
    ]) {
      const entry = row()
      entry.source.title = ruTitle
      entry.working.title = ruTitle
      expect(hasVersionConflict(entry, candidate)).toBe(true)
      expect(metadataMatch(entry)).toBeNull()
    }

    const pairs: Array<[string, string, string?]> = [
      ['Self Aware (Ремикс)', 'Self Aware (Remix)'],
      ['Self Aware (Кавер)', 'Self Aware (Cover)'],
      ['Self Aware (Лайв)', 'Self Aware (Live)'],
      ['Self Aware (Ремастер)', 'Self Aware (Remastered 2020)'],
      ['Self Aware (Акустическая версия)', 'Self Aware (Acoustic)'],
      ['Self Aware (Инструментал)', 'Self Aware (Instrumental)'],
      ['Self Aware (Ускоренная версия)', 'Self Aware (Sped Up)'],
      ['Self Aware (Замедленная)', 'Self Aware (Slowed)'],
    ]
    for (const [vkTitle, spTitle] of pairs) {
      const entry = row()
      entry.source.title = vkTitle
      entry.working.title = vkTitle
      expect(hasVersionConflict(entry, { ...candidate, title: spTitle })).toBe(false)
    }

    const mismatched = row()
    mismatched.working.title = 'Self Aware (Ремикс)'
    expect(hasVersionConflict(mismatched, { ...candidate, title: 'Self Aware (Live)' })).toBe(true)
  })

  it('preserves Cyrillic ё and й for transliteration when diacritics rule is enabled', () => {
    const searched = (artist: string, title: string, candidates: SpotifyTrack[]) => {
      const entry = row()
      entry.working.artist = artist
      entry.working.title = title
      entry.working.searchedQuery = searchText(entry.working)
      entry.working.candidates = candidates
      return entry
    }

    const yolka = searched('Artist', 'Ёлка', [
      { ...candidate, artists: ['Artist'], title: 'Yolka', duration: 181 },
    ])
    expect(metadataMatch(yolka)).not.toBeNull()
    expect(reviewGroup(yolka)).toBe('exact')

    const yolkaRu = searched('Artist', 'Ёлка', [
      { ...candidate, artists: ['Artist'], title: 'Елка', duration: 181 },
    ])
    expect(metadataMatch(yolkaRu)).not.toBeNull()
    expect(reviewGroup(yolkaRu)).toBe('exact')

    const yolkaElka = searched('Artist', 'Ёлка', [
      { ...candidate, artists: ['Artist'], title: 'Elka', duration: 181 },
    ])
    expect(metadataMatch(yolkaElka)).not.toBeNull()
    expect(reviewGroup(yolkaElka)).toBe('exact')

    const may = searched('Artist', 'Май', [
      { ...candidate, artists: ['Artist'], title: 'May', duration: 181 },
    ])
    expect(metadataMatch(may)).not.toBeNull()
    expect(reviewGroup(may)).toBe('exact')

    const punct = searched('Альянс', 'На Заре (Live)', [
      { ...candidate, artists: ['Альянс'], title: 'Na Zare - Live', duration: 181 },
    ])
    expect(metadataMatch(punct)).not.toBeNull()
    expect(metadataMatch(punct, { ...defaultMatchingRules, remixPunctuation: false })).toBeNull()
  })

  it('rejects false-positive remixes and mismatched featured guests while keeping valid matches', () => {
    const searched = (artist: string, title: string, candidates: SpotifyTrack[]) => {
      const entry = row()
      entry.working.artist = artist
      entry.working.title = title
      entry.working.searchedQuery = searchText(entry.working)
      entry.working.candidates = candidates
      return entry
    }

    // Wrong main artist even when remixer matches candidate artists
    const wrongMain = searched('Wrong Artist', 'Track (DJ B Remix)', [
      { ...candidate, artists: ['Original Artist', 'DJ B'], title: 'Track (DJ B Remix)' },
    ])
    expect(metadataMatch(wrongMain)).toBeNull()
    expect(reviewGroup(wrongMain)).toBe('review')

    // Short remixer substring ('A' inside 'Track (Remix)') must not match
    const shortSubstring = searched('Original Artist', 'Track (Remix)', [
      { ...candidate, artists: ['Original Artist', 'A'], title: 'Track (Remix)' },
    ])
    expect(metadataMatch(shortSubstring)).toBeNull()

    // Valid remix with matching main artist and token-bounded remixer
    const validRemix = searched('Original Artist', 'Track (DJ B Remix)', [
      { ...candidate, artists: ['Original Artist', 'DJ B'], title: 'Track (DJ B Remix)' },
    ])
    expect(metadataMatch(validRemix)).not.toBeNull()

    // Different featured guests with same main artist must not match
    const diffFeat = searched('Main', 'Song (feat. GuestA)', [
      { ...candidate, artists: ['Main'], title: 'Song (feat. GuestB)' },
    ])
    expect(metadataMatch(diffFeat)).toBeNull()
    expect(reviewGroup(diffFeat)).toBe('review')

    // Missing featured guest on candidate must not match
    const missingFeat = searched('Main', 'Song (feat. GuestA)', [
      { ...candidate, artists: ['Main'], title: 'Song' },
    ])
    expect(metadataMatch(missingFeat)).toBeNull()

    // Featured guest in VK title matching candidate artists list must still match
    const validFeat = searched('Main', 'Song (feat. Guest)', [
      { ...candidate, artists: ['Main', 'Guest'], title: 'Song' },
    ])
    expect(metadataMatch(validFeat)).not.toBeNull()
    expect(reviewGroup(validFeat)).toBe('exact')
  })

  it('stops extractFeatures before version suffixes and matches working.version', () => {
    expect(extractFeatures('Song feat. Guest (Demo)')).toEqual({
      baseTitle: 'Song (Demo)',
      featured: ['Guest'],
      producers: [],
    })
    expect(extractFeatures('Song feat. Guest - Live')).toEqual({
      baseTitle: 'Song - Live',
      featured: ['Guest'],
      producers: [],
    })

    const demoRow = row()
    demoRow.working.artist = 'Main'
    demoRow.working.title = 'Song feat. Guest (Demo)'
    demoRow.working.candidates = [{ ...candidate, artists: ['Main', 'Guest'], title: 'Song' }]
    expect(metadataMatch(demoRow)).toBeNull()
    demoRow.working.candidates = [
      { ...candidate, artists: ['Main', 'Guest'], title: 'Song (Demo)' },
    ]
    expect(metadataMatch(demoRow)).not.toBeNull()

    const versionRow = row()
    versionRow.working.artist = 'Кар-Мэн'
    versionRow.working.title = 'Звуковой агрессор'
    versionRow.working.version = '2026 Version'
    versionRow.working.searchedQuery = searchText(versionRow.working)
    versionRow.working.candidates = [
      { ...candidate, artists: ['Кар-Мэн'], title: 'Звуковой агрессор (2026 Version)' },
    ]
    expect(metadataMatch(versionRow)).not.toBeNull()
    expect(reviewGroup(versionRow)).toBe('exact')
  })

  it('enforces word boundaries, all tags, and user-edited working.title in hasVersionConflict', () => {
    const olive = row()
    olive.working.title = 'Self Aware (Live)'
    expect(hasVersionConflict(olive, { ...candidate, title: 'Self Aware', album: 'Olive' })).toBe(
      true,
    )

    const credit = row()
    credit.working.title = 'Self Aware (Edit)'
    expect(hasVersionConflict(credit, { ...candidate, title: 'Self Aware', album: 'Credit' })).toBe(
      true,
    )

    const oliveTitle = row()
    oliveTitle.working.artist = 'Artist'
    oliveTitle.working.title = 'Olive'
    oliveTitle.working.candidates = [{ ...candidate, artists: ['Artist'], title: 'Olive' }]
    expect(hasVersionConflict(oliveTitle, oliveTitle.working.candidates[0])).toBe(false)
    expect(metadataMatch(oliveTitle)).not.toBeNull()

    // Multiple version markers and multiple bracketed tags must all be checked
    const multiMarker = row()
    multiMarker.working.title = 'Self Aware (Live Remix)'
    expect(hasVersionConflict(multiMarker, { ...candidate, title: 'Self Aware (Live)' })).toBe(true)
    expect(
      hasVersionConflict(multiMarker, { ...candidate, title: 'Self Aware (Live Remix)' }),
    ).toBe(false)

    const multiTags = row()
    multiTags.working.title = 'Self Aware [Live] [MY TAG]'
    expect(hasVersionConflict(multiTags, { ...candidate, title: 'Self Aware (Live)' })).toBe(true)

    // User removed an erroneous tag from working.title while source.title still has it
    const edited = row()
    edited.source.title = 'Self Aware (Remix)'
    edited.working.title = 'Self Aware'
    edited.working.candidates = [candidate]
    expect(hasVersionConflict(edited, candidate)).toBe(false)
    expect(metadataMatch(edited)).not.toBeNull()
  })
})
