import { DatabaseSync, type StatementSync } from 'node:sqlite'

/** One connection and prepared statement per SQL shape, rather than per row. */
export class Database {
  readonly connection: DatabaseSync
  private statements = new Map<string, StatementSync>()
  private transactionDepth = 0

  constructor(path: string) {
    this.connection = new DatabaseSync(path)
    this.connection.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    )
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id), position INTEGER NOT NULL, source TEXT NOT NULL, working TEXT NOT NULL, UNIQUE(collection_id, position));
      CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT NOT NULL, changes TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS source_immutable BEFORE UPDATE OF source,position,collection_id ON entries BEGIN SELECT RAISE(ABORT, 'Source is immutable'); END;
    `)
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
    if (this.transactionDepth) return action()
    this.connection.exec('BEGIN IMMEDIATE')
    this.transactionDepth++
    try {
      const result = action()
      this.connection.exec('COMMIT')
      return result
    } catch (error) {
      this.connection.exec('ROLLBACK')
      throw error
    } finally {
      this.transactionDepth--
    }
  }

  close(): void {
    this.statements.clear()
    this.connection.close()
  }
}
