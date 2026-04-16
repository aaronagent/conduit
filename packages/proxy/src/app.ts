import { Hono } from "hono"
import type { Database } from "bun:sqlite"
import { messageRoutes } from "./routes/messages/route"
import { completionRoutes } from "./routes/chat-completions/route"
import { modelRoutes } from "./routes/models/route"
import { createStatsRoute } from "./routes/stats"
import { createRequestsRoute } from "./routes/api-requests"
import { createSettingsRoute } from "./routes/api-settings"
import { createKeysRoute } from "./routes/api-keys"
import { createProvidersRoute } from "./routes/api-providers"
import { createConnectionInfoRoute } from "./routes/connection-info"
import { createCopilotInfoRoute } from "./routes/copilot-info"
import { apiKeyAuth, dashboardAuth } from "./middleware"

export function createApp(db: Database, opts: { port: number; baseUrl: string | null; apiKey?: string; internalKey?: string }): Hono {
  const app = new Hono()

  app.get("/health", (c) => c.json({ status: "ok" }))

  // Auth middleware for AI coding routes
  const aiAuth = apiKeyAuth({ envApiKey: opts.apiKey || null })
  app.use("/v1/*", aiAuth)
  app.use("/chat/*", aiAuth)

  // Auth middleware for management/dashboard routes
  const mgmtAuth = dashboardAuth({ envApiKey: opts.apiKey || null, internalKey: opts.internalKey || null })
  app.use("/api/*", mgmtAuth)

  // AI API routes
  app.route("/v1/messages", messageRoutes)
  app.route("/v1/chat/completions", completionRoutes)
  app.route("/chat/completions", completionRoutes)
  app.route("/v1/models", modelRoutes)

  // Management API routes
  app.route("/api", createStatsRoute(db))
  app.route("/api", createRequestsRoute(db))
  app.route("/api", createSettingsRoute(db))
  app.route("/api", createKeysRoute(db))
  app.route("/api", createProvidersRoute(db))
  app.route("/api", createConnectionInfoRoute(opts))
  app.route("/api", createCopilotInfoRoute())

  return app
}
