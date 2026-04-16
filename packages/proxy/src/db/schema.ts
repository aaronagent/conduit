import { Database } from "bun:sqlite"

export function initDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")

  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      path TEXT NOT NULL,
      client_format TEXT NOT NULL,
      model TEXT NOT NULL,
      resolved_model TEXT,
      strategy TEXT,
      stream INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      ttft_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'ok',
      status_code INTEGER NOT NULL DEFAULT 200,
      upstream_status INTEGER,
      error_message TEXT,
      account_name TEXT DEFAULT 'default',
      session_id TEXT DEFAULT '',
      client_name TEXT DEFAULT '',
      client_version TEXT
    )
  `)

  // Indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)")

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      hash TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked INTEGER DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      format TEXT NOT NULL DEFAULT 'openai',
      model_patterns TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      supports_models_endpoint INTEGER DEFAULT 0
    )
  `)

  return db
}
