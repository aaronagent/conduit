import type { ServerWebSocket } from "bun"
import { logEmitter } from "../util/log-emitter"
import type { LogEvent } from "../util/log-event"

/**
 * Handle WebSocket connections for real-time log streaming.
 * Sends recent events on connect (backfill), then streams new events.
 */
export function handleWebSocketOpen(ws: ServerWebSocket<unknown>): void {
  // Send recent events as backfill
  const recent = logEmitter.getRecent()
  for (const event of recent) {
    ws.send(JSON.stringify(event))
  }

  // Subscribe to new events
  const listener = (event: LogEvent) => {
    try {
      ws.send(JSON.stringify(event))
    } catch {
      // Client disconnected
    }
  }

  logEmitter.on("log", listener)

  // Store listener for cleanup
  ;(ws as any)._logListener = listener
}

export function handleWebSocketClose(ws: ServerWebSocket<unknown>): void {
  const listener = (ws as any)._logListener
  if (listener) {
    logEmitter.off("log", listener)
  }
}
