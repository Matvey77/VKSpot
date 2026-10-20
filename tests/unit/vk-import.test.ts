import { describe, expect, it } from 'vitest'
import { vkImportPreview, vkExportOptionsSchema } from '../../src/core/vk-import'

const result = (count = 3, expected: number | null = null, reason = 'end') => ({
  tracks: Array.from({ length: count }, (_, index) => ({
    id: String(index),
    artist: 'Автор',
    title: 'Трек (Remix)',
  })),
  expectedCount: expected,
  extraction: { reason, missingMetadata: 0, reachedEnd: reason === 'end' },
})

describe('VK extraction evidence', () => {
  it('never turns end of the loaded DOM into proof of a complete collection', () => {
    expect(vkImportPreview(result(), null).completeness.status).toBe('unverified')
    const partial = vkImportPreview(result(398), 8001)
    expect(partial.completeness).toMatchObject({ expected: 8001, status: 'unverified' })
    expect(partial.completeness.message).toContain('398 из ожидаемых 8001')
  })
  it('verifies count only after an uninterrupted end and consistent count evidence', () => {
    expect(vkImportPreview(result(3, 3), null).completeness.status).toBe('verified-count')
    expect(vkImportPreview(result(), 3).completeness.status).toBe('verified-count')
    expect(vkImportPreview(result(3, 300), 3).completeness.status).toBe('unverified')
    for (const reason of ['gap', 'cancelled', 'page-changed', 'timeout', 'limit'])
      expect(vkImportPreview(result(3, 3, reason), 3).completeness.status).toBe('unverified')
  })
  it('rejects empty descriptions and retains partially unread and repeated occurrences', () => {
    const value = result()
    value.tracks.forEach((track) => {
      track.artist = ''
      track.title = ''
    })
    expect(() => vkImportPreview(value, 3)).toThrow('без названий')
    value.tracks[0].title = 'Неизвестный исполнитель (Mashup)'
    value.tracks[1].title = 'Неизвестный исполнитель (Mashup)'
    value.tracks[1].id = value.tracks[0].id
    const partial = vkImportPreview(value, 3)
    expect(partial.tracks).toHaveLength(3)
    expect(partial.completeness.status).toBe('unverified')
    expect(partial.completeness.message).toContain('У 3 записей')
  })
  it('handles partial range export preview', () => {
    const options = vkExportOptionsSchema.parse({ limit: 50, rangeFrom: 1, rangeTo: 50 })
    const res = {
      tracks: Array.from({ length: 50 }, (_, i) => ({
        id: `vk-${i}`,
        artist: `Artist ${i}`,
        title: `Track ${i}`,
        duration: 180,
        availability: 'unknown',
        url: '',
        rawText: '',
      })),
      expectedCount: 50,
      range: { from: 1, to: 50 },
      extraction: {
        reason: 'limit',
        missingMetadata: 0,
        reachedEnd: true,
      },
    }
    const preview = vkImportPreview(res, options)
    expect(preview.tracks).toHaveLength(50)
  })
})
