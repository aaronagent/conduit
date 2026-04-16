import { Hono } from "hono"
import { state } from "../lib/state"
import { cacheModels } from "../lib/utils"

export function createCopilotInfoRoute(): Hono {
  const app = new Hono()

  app.get("/copilot/models", async (c) => {
    const refresh = c.req.query("refresh") === "true"
    if (refresh || !state.models) await cacheModels()
    return c.json(state.models ?? { data: [] })
  })

  return app
}
