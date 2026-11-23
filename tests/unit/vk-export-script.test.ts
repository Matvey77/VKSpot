import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const scriptPath = resolve('resources/scripts/vk-export.js')
const scriptSource = readFileSync(scriptPath, 'utf8')

type AttrMap = Record<string, string>

class MockElement {
  children: MockElement[] = []
  parentElement: MockElement | null = null
  attrs = new Map<string, string>()
  textContent = ''
  scrollTop = 0
  scrollHeight = 500
  clientHeight = 500
  clientTop = 0
  top = 0
  height = 40
  connected = true
  doc: MockDocument
  tagName: string

  constructor(doc: MockDocument, tagName: string, attrs: AttrMap = {}, textContent = '') {
    this.doc = doc
    this.tagName = tagName.toUpperCase()
    for (const [key, value] of Object.entries(attrs)) {
      this.attrs.set(key, value)
    }
    this.textContent = textContent
  }

  get isConnected(): boolean {
    if (!this.connected) return false
    if (this === this.doc.root) return true
    let cur = this.parentElement
    while (cur) {
      if (!cur.connected) return false
      if (cur === this.doc.root) return true
      cur = cur.parentElement
    }
    return false
  }

  get className(): string {
    return this.attrs.get('class') ?? ''
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }

  append(...nodes: MockElement[]): void {
    for (const node of nodes) {
      node.parentElement = this
      this.children.push(node)
    }
  }

  getBoundingClientRect() {
    return { top: this.top, height: this.height, width: 400 }
  }

  getClientRects() {
    return [{ top: this.top, height: this.height, width: 400 }]
  }

  scrollIntoView(): void {}

  scrollTo(options: { top?: number }): void {
    if (typeof options?.top === 'number') this.scrollTop = options.top
  }

  matches(selectorList: string): boolean {
    return selectorList.split(',').some((part) => this.matchesSingle(part.trim()))
  }

  private matchesSingle(selector: string): boolean {
    if (!selector) return false
    if (/^[a-z]+$/i.test(selector)) return this.tagName === selector.toUpperCase()
    const chunks = selector.match(/(?:\[[^\]]+\]|\.[A-Za-z0-9_-]+|#[A-Za-z0-9_-]+|[a-z]+)/gi)
    if (!chunks) return false
    return chunks.every((chunk) => {
      if (chunk.startsWith('#')) return this.attrs.get('id') === chunk.slice(1)
      if (chunk.startsWith('.')) {
        const cls = this.attrs.get('class') ?? ''
        return cls.split(/\s+/).includes(chunk.slice(1))
      }
      if (chunk.startsWith('[')) {
        const inner = chunk.slice(1, -1)
        const eq = inner.indexOf('=')
        if (eq === -1) return this.attrs.has(inner)
        const rawKey = inner.slice(0, eq)
        const val = inner.slice(eq + 1).replace(/^['"]|['"]$/g, '')
        if (rawKey.endsWith('*')) {
          const attr = this.attrs.get(rawKey.slice(0, -1))
          return attr !== undefined && attr.includes(val)
        }
        return this.attrs.get(rawKey) === val
      }
      return this.tagName === chunk.toUpperCase()
    })
  }

  closest(selectorList: string): MockElement | null {
    if (this.matches(selectorList)) return this
    let cur = this.parentElement
    while (cur) {
      if (cur.matches(selectorList)) return cur
      cur = cur.parentElement
    }
    return null
  }

  querySelector(selectorList: string): MockElement | null {
    return this.querySelectorAll(selectorList)[0] ?? null
  }

  querySelectorAll(selectorList: string): MockElement[] {
    const out: MockElement[] = []
    const visit = (node: MockElement) => {
      for (const child of node.children) {
        if (child.matches(selectorList)) out.push(child)
        visit(child)
      }
    }
    visit(this)
    return out
  }

  compareDocumentPosition(other: MockElement): number {
    const order = this.doc.walkOrder()
    const selfIndex = order.indexOf(this)
    const otherIndex = order.indexOf(other)
    if (selfIndex === -1 || otherIndex === -1) return 0
    return otherIndex > selfIndex ? 4 : otherIndex < selfIndex ? 2 : 0
  }
}

class MockDocument {
  root: MockElement
  body: MockElement
  scrollingElement: MockElement
  documentElement: MockElement

  constructor() {
    this.root = new MockElement(this, 'html')
    this.body = new MockElement(this, 'body')
    this.root.append(this.body)
    this.scrollingElement = this.body
    this.documentElement = this.root
  }

  walkOrder(): MockElement[] {
    const order: MockElement[] = []
    const visit = (node: MockElement) => {
      order.push(node)
      for (const child of node.children) visit(child)
    }
    visit(this.root)
    return order
  }

  querySelector(selectorList: string): MockElement | null {
    return this.root.querySelector(selectorList)
  }

  querySelectorAll(selectorList: string): MockElement[] {
    return this.root.querySelectorAll(selectorList)
  }

  createElement(tag: string) {
    if (tag.toLowerCase() === 'template') {
      const state = { textContent: '' }
      return {
        content: state,
        set innerHTML(html: string) {
          state.textContent = String(html)
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
        },
      }
    }
    return new MockElement(this, tag)
  }
}

async function runExportScript(
  doc: MockDocument,
  options: {
    config?: Record<string, unknown>
    onTimer?: (elapsedMs: number) => void
  } = {},
) {
  let virtualNow = 1_000_000
  const startNow = virtualNow
  const sandbox: Record<string, unknown> = {
    document: doc,
    location: { href: 'https://vk.com/audios42?section=all' },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    getComputedStyle: () => ({ visibility: 'visible', overflowY: 'visible' }),
    __VKSPOT_EXPORT_CONFIG__: options.config ?? {},
    Date: Object.assign(function FakeDate() {}, { now: () => virtualNow }),
    setTimeout: (fn: () => void, ms = 0) => {
      queueMicrotask(() => {
        virtualNow += ms
        options.onTimer?.(virtualNow - startNow)
        fn()
      })
      return 1
    },
    clearTimeout: () => {},
  }
  sandbox.globalThis = sandbox
  const context = vm.createContext(sandbox)
  return (await vm.runInContext(scriptSource, context)) as {
    ok: boolean
    error?: string
    result?: {
      tracks: Array<{
        id: string
        artist: string
        title: string
        duration: number | null
        availability: string
      }>
      expectedCount: number | null
    }
  }
}

describe('vk-export.js script execution', () => {
  it.each([
    ['Russian button', 'Перемешать всё'],
    ['English button', 'Shuffle all'],
  ])(
    'getShuffleBtn() finds a lazily mounted %s after returning undefined initially and excludes widgets above it',
    async (_label, buttonText) => {
      const doc = new MockDocument()
      const wrapper = new MockElement(doc, 'div', { id: 'page' })
      const widgetRow = new MockElement(doc, 'div', {
        'data-testid': 'MusicTrackRow',
        'data-audio-id': '99_1',
      })
      widgetRow.top = 10
      widgetRow.append(
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Title' }, 'Widget Song'),
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Authors' }, 'Widget Artist'),
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Duration' }, '2:30'),
      )

      const headerSlot = new MockElement(doc, 'div', { id: 'controls-slot' })
      const myTracks = new MockElement(doc, 'div', {
        'data-testid': 'AudioCatalog_SectionMyTracks',
      })
      const myRow = new MockElement(doc, 'div', {
        'data-testid': 'MusicTrackRow',
        'data-audio-id': '42_1',
      })
      myRow.top = 100
      myRow.append(
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Title' }, 'My Real Track'),
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Authors' }, 'My Artist'),
        new MockElement(doc, 'span', { 'data-testid': 'MusicTrackRow_Duration' }, '3:15'),
      )
      myTracks.append(myRow)
      wrapper.append(widgetRow, headerSlot, myTracks)
      doc.body.append(wrapper)

      let injected = false
      const output = await runExportScript(doc, {
        onTimer: (elapsed) => {
          if (!injected && elapsed >= 500) {
            injected = true
            const shuffleBtn = new MockElement(doc, 'button', {}, buttonText)
            headerSlot.append(shuffleBtn)
          }
        },
      })

      expect(output.ok).toBe(true)
      expect(output.result?.tracks).toHaveLength(1)
      expect(output.result?.tracks[0]).toMatchObject({
        id: '42_1',
        artist: 'My Artist',
        title: 'My Real Track',
        duration: 195,
      })
    },
  )

  it('maps empty string duration "" to null (not 0), preserves 0 duration, and reads aria-setsize from positionNode', async () => {
    const doc = new MockDocument()
    const list = new MockElement(doc, 'div', { id: 'au_search_items' })

    const item1Wrapper = new MockElement(doc, 'div', {
      'aria-posinset': '1',
      'aria-setsize': '2',
    })
    const row1 = new MockElement(doc, 'div', {
      class: 'audio_item',
      'data-audio': JSON.stringify({
        id: 101,
        owner_id: 7,
        artist: 'Empty Duration Artist',
        title: 'Unknown Length',
        duration: '',
      }),
    })
    row1.top = 20
    item1Wrapper.append(row1)

    const item2Wrapper = new MockElement(doc, 'div', {
      'aria-posinset': '2',
      'aria-setsize': '2',
    })
    const row2 = new MockElement(doc, 'div', {
      class: 'audio_item',
      'data-audio': JSON.stringify([102, 7, '', 'Zero Length', 'Zero Artist', 0]),
    })
    row2.top = 60
    item2Wrapper.append(row2)

    list.append(item1Wrapper, item2Wrapper)
    doc.body.append(list)

    const output = await runExportScript(doc)
    expect(output.ok).toBe(true)
    expect(output.result?.expectedCount).toBe(2)
    expect(output.result?.tracks).toEqual([
      expect.objectContaining({
        id: '7_101',
        artist: 'Empty Duration Artist',
        title: 'Unknown Length',
        duration: null,
      }),
      expect.objectContaining({
        id: '7_102',
        artist: 'Zero Artist',
        title: 'Zero Length',
        duration: 0,
      }),
    ])
  })

  it.each([
    [1, '1 запись'],
    [2, '2 записи'],
    [5, '5 записей'],
  ])('declines empty-metadata error count (%i -> %s) in Russian', async (count, expected) => {
    const doc = new MockDocument()
    const list = new MockElement(doc, 'div', { id: 'au_search_items' })
    for (let i = 0; i < count; i++) {
      const row = new MockElement(doc, 'div', {
        class: 'audio_item',
        'data-audio': JSON.stringify({ id: i + 1, owner_id: 1, artist: '', title: '' }),
      })
      row.top = i * 40
      list.append(row)
    }
    doc.body.append(list)

    const output = await runExportScript(doc)
    expect(output.ok).toBe(false)
    expect(output.error).toContain(`VK показал ${expected},`)
  })
})
