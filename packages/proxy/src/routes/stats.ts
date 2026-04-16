import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { getStats } from "../db/requests"

export function createStatsRoute(db: Database): Hono {
  const app = new Hono()
  app.get("/stats", (c) => c.json(getStats(db)))
  return app
}
