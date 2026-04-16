import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { getAllProviders, createProvider, updateProvider, deleteProvider, getEnabledProviders } from "../db/providers"
import { state } from "../lib/state"

export function createProvidersRoute(db: Database): Hono {
  const app = new Hono()

  app.get("/upstreams", (c) => c.json(getAllProviders(db)))

  app.post("/upstreams", async (c) => {
    const body = await c.req.json()
    const provider = createProvider(db, body)
    state.providers = getEnabledProviders(db)
    return c.json(provider)
  })

  app.put("/upstreams/:id", async (c) => {
    const id = parseInt(c.req.param("id"))
    const body = await c.req.json()
    updateProvider(db, id, body)
    state.providers = getEnabledProviders(db)
    return c.json({ ok: true })
  })

  app.delete("/upstreams/:id", (c) => {
    const id = parseInt(c.req.param("id"))
    deleteProvider(db, id)
    state.providers = getEnabledProviders(db)
    return c.json({ ok: true })
  })

  return app
}
