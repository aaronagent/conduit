import type { Database } from "bun:sqlite"

export interface RequestRecord {
  id: string
  timestamp: number
  path: string
  client_format: string
  model: string
  resolved_model: string | null
  strategy: string | null
  stream: number
  input_tokens: number
  output_tokens: number
  latency_ms: number
  ttft_ms: number | null
  status: string
  status_code: number
  error_message: string | null
  account_name: string
  session_id: string
  client_name: string
  client_version: string | null
}

export function insertRequest(db: Database, record: RequestRecord): void {
  const stmt = db.prepare(`
    INSERT INTO requests (id, timestamp, path, client_format, model, resolved_model, strategy, stream, input_tokens, output_tokens, latency_ms, ttft_ms, status, status_code, error_message, account_name, session_id, client_name, client_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    record.id, record.timestamp, record.path, record.client_format,
    record.model, record.resolved_model, record.strategy, record.stream,
    record.input_tokens, record.output_tokens, record.latency_ms, record.ttft_ms,
    record.status, record.status_code, record.error_message,
    record.account_name, record.session_id, record.client_name, record.client_version
  )
}

export function getRequests(db: Database, options: { limit?: number; offset?: number; model?: string; status?: string } = {}): RequestRecord[] {
  const { limit = 50, offset = 0, model, status } = options
  let sql = "SELECT * FROM requests"
  const conditions: string[] = []
  const params: (string | number | bigint | boolean | null)[] = []

  if (model) { conditions.push("model = ?"); params.push(model) }
  if (status) { conditions.push("status = ?"); params.push(status) }

  if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ")
  sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)

  return db.prepare(sql).all(...params) as RequestRecord[]
}

export function getStats(db: Database): { total: number; errors: number; avgLatency: number; totalInputTokens: number; totalOutputTokens: number } {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
      AVG(latency_ms) as avgLatency,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens
    FROM requests
  `).get() as any
  return {
    total: row?.total ?? 0,
    errors: row?.errors ?? 0,
    avgLatency: Math.round(row?.avgLatency ?? 0),
    totalInputTokens: row?.totalInputTokens ?? 0,
    totalOutputTokens: row?.totalOutputTokens ?? 0,
  }
}
