import type { Database } from "bun:sqlite"

export interface ProviderRecord {
  id: number
  name: string
  base_url: string
  api_key: string
  format: "openai" | "anthropic"
  model_patterns: string
  enabled: number
  supports_models_endpoint: number
}

export function getEnabledProviders(db: Database): ProviderRecord[] {
  return db.prepare("SELECT * FROM providers WHERE enabled = 1").all() as ProviderRecord[]
}

export function getAllProviders(db: Database): ProviderRecord[] {
  return db.prepare("SELECT * FROM providers ORDER BY name").all() as ProviderRecord[]
}

export function createProvider(db: Database, provider: Omit<ProviderRecord, "id">): ProviderRecord {
  const result = db.prepare(
    "INSERT INTO providers (name, base_url, api_key, format, model_patterns, enabled, supports_models_endpoint) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(provider.name, provider.base_url, provider.api_key, provider.format, provider.model_patterns, provider.enabled, provider.supports_models_endpoint)

  return { id: Number(result.lastInsertRowid), ...provider }
}

export function updateProvider(db: Database, id: number, updates: Partial<Omit<ProviderRecord, "id">>): boolean {
  const fields: string[] = []
  const values: (string | number | bigint | boolean | null)[] = []
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`)
    values.push(value)
  }
  if (fields.length === 0) return false
  values.push(id)
  const result = db.prepare(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`).run(...values)
  return result.changes > 0
}

export function deleteProvider(db: Database, id: number): boolean {
  const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id)
  return result.changes > 0
}
