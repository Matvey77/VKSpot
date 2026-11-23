import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const rootDir = resolve(__dirname, '../..')

function listMarkdownDocs(): string[] {
  const rootDocs = ['README.md', 'PRODUCT.md', 'DESIGN.md', 'SECURITY.md', 'AGENTS.md'].map(
    (name) => join(rootDir, name),
  )
  const docsDir = join(rootDir, 'docs')
  const nestedDocs = readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(docsDir, entry.name))
    .sort()
  return [...rootDocs, ...nestedDocs]
}

function stripYamlFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, (block) =>
    block.replace(/[^\r\n]/g, ''),
  )
}

function stripFencedCodeBlocks(content: string): string {
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let activeFence: { char: string; len: number } | null = null

  for (const line of lines) {
    const trimmed = line.trimStart()
    const match = trimmed.match(/^(`{3,}|~{3,})(.*)$/)
    if (match) {
      const marker = match[1]
      const rest = match[2]
      if (!activeFence) {
        if (marker[0] === '`' && rest.includes('`')) {
          out.push(line)
          continue
        }
        activeFence = { char: marker[0], len: marker.length }
        out.push('')
        continue
      }
      if (marker[0] === activeFence.char && marker.length >= activeFence.len && !rest.trim()) {
        activeFence = null
        out.push('')
        continue
      }
    }
    out.push(activeFence ? '' : line)
  }

  return out.join('\n')
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2')
}

export function slugifyGitHub(rawHeading: string): string {
  return stripInlineMarkdown(rawHeading)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function extractHeadingSlugs(markdown: string): Set<string> {
  const body = stripFencedCodeBlocks(stripYamlFrontmatter(markdown))
  const slugs = new Set<string>()
  const counts = new Map<string, number>()

  const registerSlug = (base: string) => {
    if (!base) return
    let candidate = base
    let seen = counts.get(base) ?? 0
    if (seen > 0 || slugs.has(candidate)) {
      while (slugs.has(`${base}-${seen === 0 ? 1 : seen}`)) {
        seen = seen === 0 ? 1 : seen + 1
      }
      candidate = `${base}-${seen === 0 ? 1 : seen}`
    }
    counts.set(base, seen + 1)
    slugs.add(candidate)
  }

  for (const line of body.split('\n')) {
    const atx = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
    if (atx) {
      registerSlug(slugifyGitHub(atx[1]))
    }

    const htmlHeading = line.match(/<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/gi)
    if (htmlHeading) {
      for (const tag of htmlHeading) {
        const inner = tag.replace(/^<h[1-6]\b[^>]*>|<\/h[1-6]>$/gi, '')
        registerSlug(slugifyGitHub(inner))
      }
    }

    for (const attr of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/gi)) {
      slugs.add(attr[1].toLowerCase())
    }
  }

  return slugs
}

type LocalLink = {
  target: string
  line: number
}

function isExternalTarget(target: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
}

function extractLocalLinks(markdown: string): LocalLink[] {
  const body = stripFencedCodeBlocks(stripYamlFrontmatter(markdown))
  const links: LocalLink[] = []
  const lines = body.split('\n')

  for (let idx = 0; idx < lines.length; idx++) {
    const lineWithoutInlineCode = lines[idx].replace(/`[^`]*`/g, '')

    for (const match of lineWithoutInlineCode.matchAll(
      /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    )) {
      let target = match[1].trim()
      if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1).trim()
      }
      if (!target || isExternalTarget(target)) continue
      links.push({ target, line: idx + 1 })
    }

    for (const match of lineWithoutInlineCode.matchAll(
      /<(?:a|img|source)\b[^>]*?\b(?:href|src|srcset)=["']([^"']+)["']/gi,
    )) {
      for (const candidate of match[1].split(',')) {
        const target = candidate.trim().split(/\s+/)[0]
        if (!target || isExternalTarget(target)) continue
        links.push({ target, line: idx + 1 })
      }
    }
  }

  return links
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

describe('documentation links and anchors', () => {
  it('slugifies Cyrillic, Latin, punctuation, and duplicate headings like GitHub', () => {
    expect(slugifyGitHub('Подключение Spotify API')).toBe('подключение-spotify-api')
    expect(slugifyGitHub('Импорт и выгрузка VK')).toBe('импорт-и-выгрузка-vk')
    expect(slugifyGitHub('Как проследить изменение')).toBe('как-проследить-изменение')
    expect(slugifyGitHub("Do's and Don'ts")).toBe('dos-and-donts')
    expect(slugifyGitHub('Elevation & Depth')).toBe('elevation--depth')
    expect(slugifyGitHub('`src/shared/` и **types**')).toBe('srcshared-и-types')

    const slugs = extractHeadingSlugs('# Тема\n\n## Тема\n\n### Тема\n')
    expect(slugs).toEqual(new Set(['тема', 'тема-1', 'тема-2']))
  })

  it('verifies every relative link and anchor across all project markdown docs', () => {
    const docs = listMarkdownDocs()
    expect(docs.length).toBeGreaterThanOrEqual(8)

    const slugCache = new Map<string, Set<string>>()
    const getSlugs = (filePath: string): Set<string> => {
      let cached = slugCache.get(filePath)
      if (!cached) {
        cached = extractHeadingSlugs(readFileSync(filePath, 'utf8'))
        slugCache.set(filePath, cached)
      }
      return cached
    }

    const errors: string[] = []

    for (const docPath of docs) {
      const relDoc = relative(rootDir, docPath).replace(/\\/g, '/')
      const content = readFileSync(docPath, 'utf8')
      const links = extractLocalLinks(content)

      for (const { target, line } of links) {
        const hashIdx = target.indexOf('#')
        const rawPath = hashIdx >= 0 ? target.slice(0, hashIdx) : target
        const rawAnchor = hashIdx >= 0 ? target.slice(hashIdx + 1) : ''
        const cleanPath = safeDecode(rawPath.split('?')[0])

        const targetFile = cleanPath ? resolve(dirname(docPath), cleanPath) : docPath
        if (!existsSync(targetFile)) {
          errors.push(`${relDoc}:${line} -> missing target "${target}"`)
          continue
        }

        if (rawAnchor) {
          if (!targetFile.toLowerCase().endsWith('.md')) continue
          const slugs = getSlugs(targetFile)
          const decodedAnchor = safeDecode(rawAnchor).toLowerCase()
          if (!slugs.has(decodedAnchor)) {
            const relTarget = relative(rootDir, targetFile).replace(/\\/g, '/')
            errors.push(`${relDoc}:${line} -> missing anchor "#${decodedAnchor}" in ${relTarget}`)
          }
        }
      }
    }

    expect(errors).toEqual([])
  })
})
