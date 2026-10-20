import { defaultMatchingRules, type Settings } from '../../shared/model'
import type { Database } from './database'

export class Preferences {
  constructor(private db: Database) {}

  settings(): Settings {
    const saved = this.value<Partial<Settings>>('preferences', {})
    return {
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
  }

  cached<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM cache WHERE key=?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : null
  }

  cache(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO cache(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
}
