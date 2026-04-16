import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { createApiKey, listApiKeys, revokeApiKey } from "../db/keys"

export function createKeysRoute(db: Database): Hono {
  const app = new Hono()
  app.get("/keys", (c) => c.json(listApiKeys(db)))
  app.post("/keys", async (c) => {
    const { name } = await c.req.json()
    const result = createApiKey(db, name)
    return c.json({ key: result.key, ...result.record })
  })
  app.delete("/keys/:id", (c) => {
    revokeApiKey(db, c.req.param("id"))
    return c.json({ ok: true })
  })
  return app
}
