import { createApp } from "./app"
import { loadConfig } from "./config"
import { initDatabase } from "./db/schema"
import { enableDatabaseSink } from "./db/log-sink"
import { ensurePaths } from "./lib/paths"
import { setupGitHubToken, setupCopilotToken } from "./lib/token"
import { cacheModels } from "./lib/utils"
import { logger } from "./util/logger"
import { state } from "./lib/state"
import { detectLocalVSCodeVersion, detectLocalCopilotVersion } from "./services/detect-local-versions"
import { handleWebSocketOpen, handleWebSocketClose } from "./ws/logs"

const config = loadConfig()

async function main() {
  logger.info("Conduit proxy starting...")

  // Ensure data directory exists
  await ensurePaths()

  // Initialize database
  const db = initDatabase(config.dbPath)

  // Enable database log sink
  enableDatabaseSink(db)

  // GitHub OAuth
  logger.info("Loading GitHub token...")
  await setupGitHubToken()

  // Copilot JWT
  logger.info("Acquiring Copilot JWT...")
  await setupCopilotToken()

  // Detect local versions
  const vsVersion = await detectLocalVSCodeVersion()
  if (vsVersion) {
    state.vsCodeVersion = vsVersion
    logger.info(`Using VSCode version: ${vsVersion} (local)`)
  } else {
    state.vsCodeVersion = "1.114.0"
    logger.info("Using VSCode version: 1.114.0 (fallback)")
  }

  const copilotVersion = await detectLocalCopilotVersion()
  if (copilotVersion) {
    state.copilotChatVersion = copilotVersion
    logger.info(`Using Copilot Chat version: ${copilotVersion} (local)`)
  } else {
    state.copilotChatVersion = "0.43.0"
    logger.info("Using Copilot Chat version: 0.43.0 (fallback)")
  }

  // Cache models
  await cacheModels()

  // Create and start server
  const app = createApp(db, {
    port: config.port,
    baseUrl: config.baseUrl || null,
    apiKey: config.apiKey,
    internalKey: config.internalKey,
  })

  const server = Bun.serve({
    port: config.port,
    fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/ws/logs") {
        const upgraded = server.upgrade(req, { data: {} })
        if (!upgraded) return new Response("Upgrade failed", { status: 400 })
        return undefined
      }
      return app.fetch(req, server)
    },
    websocket: {
      open: handleWebSocketOpen,
      close: handleWebSocketClose,
      message() {}, // No client messages expected
    },
  })

  logger.info(`Conduit proxy listening on port ${server.port}`)
}

main().catch((err) => {
  logger.error("Failed to start Conduit", { error: String(err) })
  process.exit(1)
})
