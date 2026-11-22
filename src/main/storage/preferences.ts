import { defaultMatchingRules } from '../../shared/defaults'
import type { Settings } from '../../shared/types'
import type { Database } from './database'

export const EMPTY_CACHE_TTL_MS = 15 * 60 * 1000
export const FULL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_CACHE_ENTRIES = 50_000
const DEFAULT_CACHE_PRUNE_INTERVAL = 100

export type PreferencesOptions = {
  maxCacheEntries?: number
  cachePruneInterval?: number
}

export class Preferences {
  private cachedSettings: Settings | null = null
  private cacheWrites = 0
  private readonly maxCacheEntries: number
  private readonly cachePruneInterval: number

  constructor(
    private db: Database,
    options: PreferencesOptions = {},
  ) {
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES
    this.cachePruneInterval = options.cachePruneInterval ?? DEFAULT_CACHE_PRUNE_INTERVAL
    const columns = this.db.prepare('PRAGMA table_info(cache)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'updated_at')) {
      this.db.connection.exec('ALTER TABLE cache ADD COLUMN updated_at INTEGER')
    }
    this.db.connection.exec('CREATE INDEX IF NOT EXISTS idx_cache_updated_at ON cache(updated_at)')
  }

  settings(): Settings {
    if (this.cachedSettings) return this.cachedSettings
    const saved = this.value<Partial<Settings>>('preferences', {})
    this.cachedSettings = {
      clientId: '',
      spotifyProxy: '',
      useProxyForVK: false,
      vkProxy: '',
      playlistName: 'Вся музыка из VK',
      searchDelayMs: 5000,
      autoResumeSearch: true,
      searchProvider: 'browser',
      theme: 'light',
      ...saved,
      matchingRules: { ...defaultMatchingRules, ...saved.matchingRules },
    }
    return this.cachedSettings
  }

  value<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : fallback
  }

  setValue(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
    if (key === 'preferences') this.cachedSettings = null
  }

  cached<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value, updated_at FROM cache WHERE key=?').get(key) as
      { value: string; updated_at: number | null } | undefined
    if (!row) return null
    const parsed = JSON.parse(row.value) as T
    if (row.updated_at !== null) {
      const ttl =
        Array.isArray(parsed) && parsed.length === 0 ? EMPTY_CACHE_TTL_MS : FULL_CACHE_TTL_MS
      if (Date.now() - row.updated_at >= ttl) {
        this.db.prepare('DELETE FROM cache WHERE key=?').run(key)
        return null
      }
    }
    return parsed
  }

  cache(key: string, value: unknown): void {
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO cache(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      )
      .run(key, JSON.stringify(value), now)
    this.cacheWrites++
    if (this.cacheWrites >= this.cachePruneInterval) {
      this.cacheWrites = 0
      this.pruneCache(now)
    }
  }

  private pruneCache(now: number): void {
    const emptyCutoff = now - EMPTY_CACHE_TTL_MS
    const fullCutoff = now - FULL_CACHE_TTL_MS
    this.db
      .prepare(
        "DELETE FROM cache WHERE updated_at IS NOT NULL AND ((value = '[]' AND updated_at <= ?) OR updated_at <= ?)",
      )
      .run(emptyCutoff, fullCutoff)
    const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM cache').get() as {
      count: number
    }
    if (count > this.maxCacheEntries) {
      this.db
        .prepare(
          'DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY COALESCE(updated_at, 0) ASC LIMIT ?)',
        )
        .run(count - this.maxCacheEntries)
    }
  }
}
