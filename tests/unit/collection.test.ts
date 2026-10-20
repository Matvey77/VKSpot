import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  createCollection,
  exportText,
  makePlan,
  mergeRepairedCollection,
  parseImport,
  reconcilePrefix,
  sourceHash,
  validateCollection,
} from '../../src/core/collection'

describe('lossless occurrence archive', () => {
  it('keeps exact source names, repeats, blocked records and positions', () => {
    const preview = parseImport(
      JSON.stringify([
        { id: '1', artist: ' x  ', title: 'remix [tag]', blocked: true },
        { id: '1', artist: ' x  ', title: 'remix [tag]' },
      ]),
      '.json',
      'VK',
    )
    const c = createCollection(preview)
    expect(c.rows).toHaveLength(2)
    expect(c.rows[0].source.artist).toBe(' x  ')
    expect(c.rows[0].id).not.toBe(c.rows[1].id)
    expect(c.rows.map((r) => r.position)).toEqual([1, 2])
    expect(c.rows[0].source.availability).toBe('blocked')
  })
  it('round trips arbitrary Unicode names without changing raw values or occurrences', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ artist: fc.string(), title: fc.string() }), {
          minLength: 1,
          maxLength: 50,
        }),
        (tracks) => {
          const c = createCollection(parseImport(JSON.stringify(tracks), '.json', 'Test'))
          const restored = parseImport(exportText(c, 'archive'), '.json', 'Test').restored!
          expect(restored.rows.map((r) => r.source.artist)).toEqual(tracks.map((t) => t.artist))
          expect(restored.rows.map((r) => r.source.title)).toEqual(tracks.map((t) => t.title))
          expect(restored.rows.map((r) => r.id)).toEqual(c.rows.map((r) => r.id))
          validateCollection(restored)
        },
      ),
      { numRuns: 80 },
    )
  })
  it('rejects altered evidence and duplicated occurrence identities', () => {
    const c = createCollection(parseImport('A - B\nA - B', '.txt', 'Test'))
    c.rows[0].source.title = 'changed'
    expect(() => validateCollection(c)).toThrow('контрольная сумма')
    c.sourceHash = sourceHash(c.rows)
    c.rows[1].id = c.rows[0].id
    expect(() => validateCollection(c)).toThrow('идентификаторы')
  })
  it('preserves quoted CSV cells and rejects broken rows', () => {
    const c = createCollection(
      parseImport('artist,title,duration\r\n"A, B","one\nTwo",3:05\r\n', '.csv', 'Test'),
    )
    expect(c.rows[0].source).toMatchObject({ artist: 'A, B', title: 'one\nTwo', duration: 185 })
    expect(() => parseImport('artist,title\nA,B,C', '.csv', 'Test')).toThrow()
    expect(() => parseImport('[{"artist":"A"}]', '.json', 'Test')).toThrow('title')
  })
  it('does not claim complete VK extraction for a plain list', () => {
    const c = createCollection(parseImport('A - B', '.txt', 'Test'))
    expect(c.completeness.status).toBe('unverified')
  })
})
describe('reviewed transfer plan', () => {
  it('keeps repeated Spotify URIs, omits only explicitly excluded entries, retains archive', () => {
    const c = createCollection(parseImport('A - Remix\nA - Remix\nA - unwanted', '.txt', 'Test'))
    const match = {
      uri: 'spotify:track:' + 'a'.repeat(22),
      title: 'Remix',
      artists: ['A'],
      album: '',
      duration: 200,
      url: '',
    }
    c.rows[0].working = { ...c.rows[0].working, destination: 'spotify', spotify: match }
    c.rows[1].working = { ...c.rows[1].working, destination: 'spotify', spotify: match }
    c.rows[2].working.excluded = true
    expect(makePlan(c).map((r) => r.uri)).toEqual([match.uri, match.uri])
    expect(c.rows).toHaveLength(3)
    validateCollection(c)
  })
  it('refuses silent skipping of unresolved entries', () => {
    const c = createCollection(parseImport('A - B', '.txt', 'Test'))
    expect(() => makePlan(c)).toThrow('не готова')
  })
  it('reconciles ambiguous writes by exact prefix including repeats', () => {
    expect(reconcilePrefix(['A', 'A', 'B'], ['A', 'A'])).toBe(2)
    expect(() => reconcilePrefix(['A', 'B'], ['B'])).toThrow()
    expect(() => reconcilePrefix(['A'], ['A', 'A'])).toThrow()
    fc.assert(
      fc.property(fc.array(fc.string()), fc.nat(), (items, n) => {
        const prefix = items.slice(0, n % (items.length + 1))
        expect(reconcilePrefix(items, prefix)).toBe(prefix.length)
      }),
    )
  })
})

describe('mergeRepairedCollection', () => {
  it('preserves existing decisions, spotify matches, and notes when updating collection', () => {
    const existing = createCollection(
      parseImport(
        JSON.stringify([
          { id: 'vk-1', artist: 'Queen', title: 'Bohemian Rhapsody' },
          { id: 'vk-2', artist: 'Daft Punk', title: 'One More Time' },
          { id: 'vk-3', artist: 'Nirvana', title: 'Smells Like Teen Spirit' },
        ]),
        '.json',
        'VK',
      ),
    )

    // User made decisions
    existing.rows[0].working = {
      ...existing.rows[0].working,
      destination: 'spotify',
      spotify: {
        uri: 'spotify:track:123',
        title: 'Bohemian Rhapsody',
        artists: ['Queen'],
        album: 'A Night at the Opera',
        duration: 354,
        url: '',
      },
      note: 'Verified original release',
    }
    existing.rows[1].working = {
      ...existing.rows[1].working,
      destination: 'local',
      local: {
        path: '/music/one_more_time.flac',
        sha256: 'abc123',
        artist: 'Daft Punk',
        title: 'One More Time',
        duration: 320,
        codec: 'flac',
        bitrate: 1000,
        size: 30000000,
      },
    }
    existing.rows[2].working = {
      ...existing.rows[2].working,
      excluded: true,
    }

    // New import with 4 tracks (including a new track in between, vk-4)
    const newPreview = parseImport(
      JSON.stringify([
        { id: 'vk-1', artist: 'Queen', title: 'Bohemian Rhapsody' },
        { id: 'vk-4', artist: 'The Beatles', title: 'Hey Jude' },
        { id: 'vk-2', artist: 'Daft Punk', title: 'One More Time' },
        { id: 'vk-3', artist: 'Nirvana', title: 'Smells Like Teen Spirit' },
      ]),
      '.json',
      'VK',
    )

    const result = mergeRepairedCollection(existing, newPreview)
    expect(result.preservedCount).toBe(3)
    expect(result.addedCount).toBe(1)
    expect(result.rows).toHaveLength(4)

    // Verify Queen preserved
    expect(result.rows[0].source.id).toBe('vk-1')
    expect(result.rows[0].working.destination).toBe('spotify')
    expect(result.rows[0].working.note).toBe('Verified original release')

    // Verify Beatles added as unresolved
    expect(result.rows[1].source.id).toBe('vk-4')
    expect(result.rows[1].working.destination).toBe('unresolved')

    // Verify Daft Punk preserved local
    expect(result.rows[2].source.id).toBe('vk-2')
    expect(result.rows[2].working.destination).toBe('local')

    // Verify Nirvana preserved excluded
    expect(result.rows[3].source.id).toBe('vk-3')
    expect(result.rows[3].working.excluded).toBe(true)
  })

  it('matches by artist and title when VK ID is absent or changed', () => {
    const existing = createCollection(
      parseImport('Radiohead - Creep\nPink Floyd - Time', '.txt', 'File'),
    )
    existing.rows[0].working = {
      ...existing.rows[0].working,
      destination: 'spotify',
      spotify: {
        uri: 'spotify:track:creep',
        title: 'Creep',
        artists: ['Radiohead'],
        album: 'Pablo Honey',
        duration: 238,
        url: '',
      },
    }

    const newPreview = parseImport(
      'Radiohead - Creep\nPink Floyd - Time\nOasis - Wonderwall',
      '.txt',
      'File',
    )
    const result = mergeRepairedCollection(existing, newPreview)
    expect(result.preservedCount).toBe(2)
    expect(result.addedCount).toBe(1)
    expect(result.rows[0].working.destination).toBe('spotify')
    expect(result.rows[0].working.spotify?.uri).toBe('spotify:track:creep')
  })

  it('appends resolved tracks that were missing in the new export to avoid data loss', () => {
    const existing = createCollection(
      parseImport('Artist A - Track 1\nArtist B - Track 2', '.txt', 'File'),
    )
    existing.rows[1].working = {
      ...existing.rows[1].working,
      destination: 'spotify',
      spotify: {
        uri: 'spotify:track:b',
        title: 'Track 2',
        artists: ['Artist B'],
        album: '',
        duration: 180,
        url: '',
      },
    }

    // New export completely missed Track 2, only has Track 1
    const newPreview = parseImport('Artist A - Track 1', '.txt', 'File')
    const result = mergeRepairedCollection(existing, newPreview)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].working.title).toBe('Track 1')
    expect(result.rows[1].working.title).toBe('Track 2')
    expect(result.rows[1].working.destination).toBe('spotify')
  })

  it('repairs a partial range and preserves all remaining tracks in place', () => {
    const existing = createCollection(
      parseImport(
        'Artist 1 - Track 1\nArtist 2 - Track 2\nArtist 3 - Track 3\nArtist 4 - Track 4\nArtist 5 - Track 5',
        '.txt',
        'File',
      ),
    )
    // Mark track 1 with spotify decision, and track 4 with note
    existing.rows[0].working = {
      ...existing.rows[0].working,
      destination: 'spotify',
      spotify: {
        uri: 'spotify:track:1',
        title: 'Track 1',
        artists: ['Artist 1'],
        album: 'Album',
        duration: 200,
        url: '',
      },
    }
    existing.rows[3].working = {
      ...existing.rows[3].working,
      note: 'Keep intact',
    }

    // Repair only range from 1 to 2 with corrected titles
    const partialPreview = parseImport(
      'Artist 1 - Track 1 (Fixed)\nArtist 2 - Track 2 (Fixed)',
      '.txt',
      'File',
    )
    partialPreview.range = { from: 1, to: 2 }

    const result = mergeRepairedCollection(existing, partialPreview)
    expect(result.rows).toHaveLength(5)
    // Verify positions are consecutive
    expect(result.rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5])
    // Verify range 1..2 was updated
    expect(result.rows[0].source.title).toBe('Track 1 (Fixed)')
    expect(result.rows[1].source.title).toBe('Track 2 (Fixed)')
    // Verify tracks 3, 4, 5 were kept intact
    expect(result.rows[2].source.title).toBe('Track 3')
    expect(result.rows[3].source.title).toBe('Track 4')
    expect(result.rows[3].working.note).toBe('Keep intact')
    expect(result.rows[4].source.title).toBe('Track 5')
  })
})
