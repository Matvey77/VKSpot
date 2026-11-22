import { DatabaseSync, type StatementSync } from 'node:sqlite'

/** One connection and prepared statement per SQL shape, rather than per row. */
export class Database {
  readonly connection: DatabaseSync
  private statements = new Map<string, StatementSync>()
  private transactionDepth = 0
  private closed = false

  constructor(path: string) {
    this.connection = new DatabaseSync(path)
    this.connection.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    )
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id), position INTEGER NOT NULL, source TEXT NOT NULL, working TEXT NOT NULL, UNIQUE(collection_id, position));
      CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT NOT NULL, changes TEXT NOT NULL, at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_history_collection ON history(collection_id, id DESC);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS source_immutable BEFORE UPDATE OF source,position,collection_id ON entries BEGIN SELECT RAISE(ABORT, 'Source is immutable'); END;
    `)
  }

  userVersion(): number {
    const row = this.prepare('PRAGMA user_version').get() as { user_version: number }
    return row.user_version
  }

  setUserVersion(version: number): void {
    if (!Number.isInteger(version) || version < 0) {
      throw new Error(`Invalid SQLite user_version: ${String(version)}`)
    }
    this.connection.exec(`PRAGMA user_version = ${version}`)
  }

  prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.connection.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }

  transaction<T>(action: () => T): T {
    if (this.transactionDepth === 0) {
      this.connection.exec('BEGIN IMMEDIATE')
      this.transactionDepth++
      try {
        const result = action()
        this.connection.exec('COMMIT')
        return result
      } catch (error) {
        try {
          this.connection.exec('ROLLBACK')
        } catch {
          // Preserve the original failure when rollback itself fails.
        }
        throw error
      } finally {
        this.transactionDepth--
      }
    }

    const savepoint = `sp_${this.transactionDepth}`
    this.connection.exec(`SAVEPOINT ${savepoint}`)
    this.transactionDepth++
    try {
      const result = action()
      this.connection.exec(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        this.connection.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        this.connection.exec(`RELEASE SAVEPOINT ${savepoint}`)
      } catch {
        // Preserve the original failure when savepoint rollback fails.
      }
      throw error
    } finally {
      this.transactionDepth--
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.statements.clear()
    this.connection.close()
  }
}
