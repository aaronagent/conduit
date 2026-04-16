import { Hono } from "hono"
import { state } from "../lib/state"

export function createConnectionInfoRoute(opts: { port: number; baseUrl: string | null }): Hono {
  const app = new Hono()
  app.get("/connection-info", (c) => {
    const base = opts.baseUrl || `http://localhost:${opts.port}`
    return c.json({
      base_url: base,
      endpoints: {
        chat_completions: "/v1/chat/completions",
        messages: "/v1/messages",
        models: "/v1/models",
      },
      models: state.models?.data.map(m => m.id) ?? [],
    })
  })
  return app
}
