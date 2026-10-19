import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  createCollection,
  exportText,
  makePlan,
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
