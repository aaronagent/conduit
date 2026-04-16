import { Hono } from "hono"
import { state } from "../../lib/state"

export const modelRoutes = new Hono()

modelRoutes.get("/", (c) => {
  const models = state.models?.data.map((model) => ({
    id: model.id,
    object: "model",
    created: 0,
    owned_by: model.vendor,
    display_name: model.name,
  })) ?? []

  return c.json({ object: "list", data: models })
})
