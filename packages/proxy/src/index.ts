import { createApp } from "./app"
import { loadConfig } from "./config"
import { initDatabase } from "./db/schema"
import { ensurePaths } from "./lib/paths"
import { setupGitHubToken, setupCopilotToken } from "./lib/token"
import { cacheModels } from "./lib/utils"
import { logger } from "./util/logger"

const config = loadConfig()

async function main() {
  logger.info("Conduit proxy starting...")

  // Ensure data directory exists
  await ensurePaths()

  // Initialize database
  const db = initDatabase(config.dbPath)

  // GitHub OAuth
  logger.info("Loading GitHub token...")
  await setupGitHubToken()

  // Copilot JWT
  logger.info("Acquiring Copilot JWT...")
  await setupCopilotToken()

  // Cache models
  await cacheModels()

  // Create and start server
  const app = createApp(db, { port: config.port, baseUrl: config.baseUrl || null })

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
  })

  logger.info(`Conduit proxy listening on port ${server.port}`)
}

main().catch((err) => {
  logger.error("Failed to start Conduit", { error: String(err) })
  process.exit(1)
})
