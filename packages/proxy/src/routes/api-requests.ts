import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { getRequests } from "../db/requests"

export function createRequestsRoute(db: Database): Hono {
  const app = new Hono()
  app.get("/requests", (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50")
    const offset = parseInt(c.req.query("offset") ?? "0")
    const model = c.req.query("model")
    const status = c.req.query("status")
    return c.json(getRequests(db, { limit, offset, ...(model ? { model } : {}), ...(status ? { status } : {}) }))
  })
  return app
}
