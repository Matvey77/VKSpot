import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')

const DOC_FILES = [
  'README.md',
  'PRODUCT.md',
  'DESIGN.md',
  'SECURITY.md',
  'AGENTS.md',
  'docs/architecture.md',
  'docs/workflows.md',
  'docs/maintenance.md',
]

function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function collectAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>()
  const counts = new Map<string, number>()
  let inCodeFence = false
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match) continue
    const base = githubSlug(match[1])
    if (!base) continue
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    anchors.add(seen === 0 ? base : `${base}-${seen}`)
  }
  return anchors
}

function extractLocalLinks(markdown: string): string[] {
  const links: string[] = []
  let inCodeFence = false
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1]
      if (!/^(?:https?:|mailto:|data:)/i.test(target)) links.push(target)
    }
    for (const match of line.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) {
      const target = match[1]
      if (!/^(?:https?:|mailto:|data:)/i.test(target)) links.push(target)
    }
  }
  return links
}

describe('Markdown documentation local links and anchors', () => {
  it('resolves every relative file path and heading anchor across project docs', () => {
    const anchorCache = new Map<string, Set<string>>()
    const getAnchors = (filePath: string) => {
      let set = anchorCache.get(filePath)
      if (!set) {
        set = collectAnchors(readFileSync(filePath, 'utf8'))
        anchorCache.set(filePath, set)
      }
      return set
    }

    for (const rel of DOC_FILES) {
      const abs = resolve(ROOT, rel)
      expect(existsSync(abs), `Missing doc file: ${rel}`).toBe(true)
      const content = readFileSync(abs, 'utf8')
      const links = extractLocalLinks(content)
      for (const link of links) {
        const [rawPath, rawHash] = link.split('#')
        const targetAbs = rawPath ? resolve(dirname(abs), rawPath) : abs
        expect(existsSync(targetAbs), `Broken link in ${rel}: ${link}`).toBe(true)
        if (rawHash) {
          const decodedHash = decodeURIComponent(rawHash)
          expect(
            getAnchors(targetAbs).has(decodedHash),
            `Broken anchor in ${rel}: ${link} (expected #${decodedHash} in ${targetAbs})`,
          ).toBe(true)
        }
      }
    }
  })
})
