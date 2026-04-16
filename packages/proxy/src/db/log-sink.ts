import type { Database } from "bun:sqlite"
import { logEmitter } from "../util/log-emitter"
import { insertRequest } from "./requests"
import type { LogEvent } from "../util/log-event"
import { playSound } from "../lib/sound"
import { state } from "../lib/state"

/**
 * Database log sink — listens to request_end events and inserts into SQLite.
 * Async/non-blocking — errors are swallowed to avoid disrupting the request flow.
 */
export function enableDatabaseSink(db: Database): void {
  logEmitter.on("log", (event: LogEvent) => {
    if (event.type !== "request_end") return

    const data = event.data ?? {}
    try {
      insertRequest(db, {
        id: event.requestId ?? `req_${Date.now()}`,
        timestamp: event.ts,
        path: String(data.path ?? "/unknown"),
        client_format: String(data.format ?? "unknown"),
        model: String(data.model ?? "unknown"),
        resolved_model: data.resolvedModel ? String(data.resolvedModel) : null,
        strategy: data.strategy ? String(data.strategy) : null,
        stream: data.stream ? 1 : 0,
        input_tokens: Number(data.inputTokens ?? 0),
        output_tokens: Number(data.outputTokens ?? 0),
        latency_ms: Number(data.latencyMs ?? 0),
        ttft_ms: data.ttftMs != null ? Number(data.ttftMs) : null,
        status: String(data.status ?? "ok"),
        status_code: Number(data.statusCode ?? 200),
        error_message: data.error ? String(data.error) : null,
        account_name: String(data.accountName ?? "default"),
        session_id: String(data.sessionId ?? ""),
        client_name: String(data.clientName ?? ""),
        client_version: data.clientVersion ? String(data.clientVersion) : null,
      })

      // Play error sound if enabled
      if (data.status === "error" && state.soundEnabled) {
        playSound(state.soundName)
      }
    } catch {
      // Swallow — DB write failure should never break request flow
    }
  })
}
