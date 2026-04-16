import type { Database } from "bun:sqlite"

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null
  return row?.value ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value)
}

export function deleteSetting(db: Database, key: string): boolean {
  const result = db.prepare("DELETE FROM settings WHERE key = ?").run(key)
  return result.changes > 0
}

export function getAllSettings(db: Database): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}
