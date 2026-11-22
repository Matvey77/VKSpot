import { describe, it, expect } from 'vitest'
import {
  createCollection,
  exportText,
  parseImport,
  validateCollection,
} from '../../src/core/collection'
import type { ExportFormat } from '../../src/shared/types'

function sampleCollection() {
  const preview = parseImport(
    JSON.stringify({
      expectedCount: 3,
      tracks: [
        { id: '1', artist: 'Artist One', title: 'Track One', duration: 200 },
        { id: '2', artist: 'Artist\nTwo', title: 'Track\rTwo', duration: 185.6 },
        { id: '3', artist: 'Skip Artist', title: 'Skip Track', duration: 120 },
      ],
    }),
    '.json',
    'Export Fixture',
  )
  const collection = createCollection(preview)
  collection.rows[0].working = {
    ...collection.rows[0].working,
    destination: 'spotify',
    spotify: {
      uri: 'spotify:track:' + 'a'.repeat(22),
      title: 'Track One',
      artists: ['Artist One'],
      album: 'Album',
      duration: 200,
      url: '',
    },
  }
  collection.rows[1].working = {
    ...collection.rows[1].working,
    version: 'Live\n2024',
    destination: 'local',
    local: {
      path: 'D:/Music/track\n#EXTINF:0,injected.mp3',
      sha256: 'deadbeef',
      artist: 'Artist Two',
      title: 'Track Two',
      duration: 185.6,
      codec: 'MP3',
      bitrate: 320000,
      size: 12345,
    },
  }
  collection.rows[2].working.excluded = true
  return collection
}

describe('collection exportText', () => {
  it('exports and round-trips archive format', () => {
    const collection = sampleCollection()
    const raw = exportText(collection, 'archive')
    const parsed = JSON.parse(raw)
    expect(parsed.format).toBe('vkspot')
    expect(parsed.version).toBe(1)

    const restored = parseImport(raw, '.json', 'Restored').restored!
    validateCollection(restored)
    expect(restored.rows.map((r) => r.id)).toEqual(collection.rows.map((r) => r.id))
  })

  it('exports raw-json and preserves expected count across re-import', () => {
    const collection = sampleCollection()
    const raw = exportText(collection, 'raw-json')
    const parsed = JSON.parse(raw)
    expect(parsed.format).toBe('vkspot-raw')
    expect(parsed.completeness.expected).toBe(3)
    expect(parsed.tracks).toHaveLength(3)

    const reimported = parseImport(raw, '.json', 'Raw Reimport')
    expect(reimported.completeness.expected).toBe(3)
    expect(reimported.completeness.status).toBe('verified-count')
    expect(reimported.completeness.reason).toBe('verified')
  })

  it('exports UTF-8 BOM CSV with source and working columns', () => {
    const collection = sampleCollection()
    const csv = exportText(collection, 'csv')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const reimported = parseImport(csv, '.csv', 'CSV Reimport')
    expect(reimported.tracks).toHaveLength(3)
    expect(reimported.tracks[0]).toMatchObject({
      id: '1',
      artist: 'Artist One',
      title: 'Track One',
      duration: 200,
    })
  })

  it('exports transfer plan JSON omitting excluded entries', () => {
    const collection = sampleCollection()
    const planJson = JSON.parse(exportText(collection, 'plan'))
    expect(planJson.format).toBe('vkspot-plan')
    expect(planJson.version).toBe(1)
    expect(planJson.items).toHaveLength(2)
    expect(planJson.items.map((item: { position: number }) => item.position)).toEqual([1, 2])
  })

  it('exports M3U8 with rounded integer durations, version labels, and newline sanitization', () => {
    const collection = sampleCollection()
    const m3u8 = exportText(collection, 'm3u8')
    const lines = m3u8.trimEnd().split('\n')
    expect(lines).toEqual([
      '#EXTM3U',
      '#EXTINF:-1,Artist One - Track One',
      'spotify:track:' + 'a'.repeat(22),
      '#EXTINF:186,Artist Two - Track Two (Live 2024)',
      'D:/Music/track #EXTINF:0,injected.mp3',
    ])
  })

  it('throws on unknown export format instead of silently emitting M3U8', () => {
    const collection = sampleCollection()
    expect(() => exportText(collection, 'xml' as ExportFormat)).toThrow('Неизвестный формат')
  })
})
