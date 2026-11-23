import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_STEPS } from '../../src/renderer/src/features/start/guide-steps'

type CaptureMark = {
  label: string
  x: number
  y: number
  width: number
  height: number
}

type CaptureRecord = {
  key: string
  theme: 'light' | 'dark'
  width: number
  height: number
  marks: CaptureMark[]
}

const rootDir = resolve(__dirname, '../..')
const guideAssetsDir = join(rootDir, 'src/renderer/src/assets/guide')

const LEGACY_PATTERNS = [
  'Архив и экспорт',
  'Исключить из переноса',
  'Выбрать и дальше',
  'Другие действия',
  'Разбор коллекции',
  'пока не реализованы',
  'Сохрани исходник',
]

describe('welcome guide integrity', () => {
  const captures = JSON.parse(
    readFileSync(join(guideAssetsDir, 'captures.json'), 'utf8'),
  ) as CaptureRecord[]
  const scenes = GUIDE_STEPS.flatMap((step) => step.scenes)

  it('covers every scene from guide-steps.ts in both light and dark themes', () => {
    expect(GUIDE_STEPS).toHaveLength(6)
    expect(scenes).toHaveLength(12)
    expect(captures).toHaveLength(scenes.length * 2)

    for (const scene of scenes) {
      for (const theme of ['light', 'dark'] as const) {
        const record = captures.find((item) => item.key === scene.key && item.theme === theme)
        expect(record, `Missing capture for ${scene.key} (${theme})`).toBeDefined()
        expect(record!.width).toBe(1440)
        expect(record!.height).toBe(1040)
        expect(record!.marks).toHaveLength(scene.instructions.length)
      }
    }
  })

  it('keeps all mark coordinates strictly within [0, 100] percent bounds', () => {
    for (const record of captures) {
      expect(record.marks.length).toBeGreaterThan(0)
      for (const mark of record.marks) {
        expect(mark.label.trim().length).toBeGreaterThan(0)
        expect(mark.x).toBeGreaterThanOrEqual(0)
        expect(mark.x).toBeLessThanOrEqual(100)
        expect(mark.y).toBeGreaterThanOrEqual(0)
        expect(mark.y).toBeLessThanOrEqual(100)
        expect(mark.width).toBeGreaterThan(0)
        expect(mark.width).toBeLessThanOrEqual(100)
        expect(mark.height).toBeGreaterThan(0)
        expect(mark.height).toBeLessThanOrEqual(100)
        expect(mark.x + mark.width).toBeLessThanOrEqual(100.01)
        expect(mark.y + mark.height).toBeLessThanOrEqual(100.01)
      }
    }
  })

  it('stores all 24 unique WebP screenshots without legacy PNG files or duplicates', () => {
    const assetFiles = readdirSync(guideAssetsDir)
    const pngFiles = assetFiles.filter((file) => file.endsWith('.png'))
    expect(pngFiles).toEqual([])

    const hashes = new Map<string, string>()
    for (const scene of scenes) {
      for (const theme of ['light', 'dark'] as const) {
        const fileName = `${scene.key}-${theme}.webp`
        const fullPath = join(guideAssetsDir, fileName)
        expect(existsSync(fullPath), `Missing WebP asset: ${fileName}`).toBe(true)
        const buffer = readFileSync(fullPath)
        expect(buffer.length).toBeGreaterThan(1000)
        const sha256 = createHash('sha256').update(buffer).digest('hex')
        const existing = hashes.get(sha256)
        expect(
          existing,
          `Duplicate screenshot hash for ${fileName} and ${existing}`,
        ).toBeUndefined()
        hashes.set(sha256, fileName)
      }
    }
    expect(hashes.size).toBe(24)
  })

  it('provides complete beginner metadata without exclamation marks or removed UI names', () => {
    for (const step of GUIDE_STEPS) {
      expect(step.prerequisites.trim().length).toBeGreaterThan(10)
      expect(step.outcome.trim().length).toBeGreaterThan(10)
      expect(step.troubleshooting.length).toBeGreaterThanOrEqual(2)

      const stepTexts = [
        step.short,
        step.title,
        step.location,
        step.description,
        step.detail,
        step.prerequisites,
        step.outcome,
        step.action,
        ...step.troubleshooting.flatMap((item) => [item.question, item.answer]),
        ...step.scenes.flatMap((scene) => [scene.name, ...scene.instructions]),
      ]
      for (const text of stepTexts) {
        expect(text).not.toContain('!')
        for (const legacy of LEGACY_PATTERNS) {
          expect(text).not.toContain(legacy)
        }
      }
    }
  })
})
