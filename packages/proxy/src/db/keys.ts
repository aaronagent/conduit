import type { Database } from "bun:sqlite"
import { generateRequestId } from "../util/id"

export interface ApiKeyRecord {
  id: string
  name: string
  hash: string
  created_at: number
  last_used_at: number | null
  revoked: number
}

function hashKey(key: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(key)
  return hasher.digest("hex")
}

export function createApiKey(db: Database, name: string): { key: string; record: ApiKeyRecord } {
  const id = generateRequestId()
  const rawKey = `ck-${id}`
  const hash = hashKey(rawKey)
  const now = Date.now()

  db.prepare("INSERT INTO api_keys (id, name, hash, created_at) VALUES (?, ?, ?, ?)").run(id, name, hash, now)

  return {
    key: rawKey,
    record: { id, name, hash, created_at: now, last_used_at: null, revoked: 0 },
  }
}

export function validateApiKey(db: Database, key: string): { name: string } | null {
  const hash = hashKey(key)
  const row = db.prepare("SELECT name, revoked FROM api_keys WHERE hash = ?").get(hash) as { name: string; revoked: number } | null
  if (!row || row.revoked) return null

  // Update last_used_at
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE hash = ?").run(Date.now(), hash)
  return { name: row.name }
}

export function listApiKeys(db: Database): ApiKeyRecord[] {
  return db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as ApiKeyRecord[]
}

export function revokeApiKey(db: Database, id: string): boolean {
  const result = db.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?").run(id)
  return result.changes > 0
}
