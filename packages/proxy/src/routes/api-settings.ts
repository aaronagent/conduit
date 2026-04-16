import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { getAllSettings, setSetting, deleteSetting } from "../db/settings"

export function createSettingsRoute(db: Database): Hono {
  const app = new Hono()
  app.get("/settings", (c) => c.json(getAllSettings(db)))
  app.post("/settings", async (c) => {
    const { key, value } = await c.req.json()
    setSetting(db, key, value)
    return c.json({ ok: true })
  })
  app.delete("/settings/:key", (c) => {
    deleteSetting(db, c.req.param("key"))
    return c.json({ ok: true })
  })
  return app
}
