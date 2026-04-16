import type { Context } from "hono"
import { streamSSE } from "hono/streaming"

import { checkRateLimit } from "../../lib/rate-limit"
import { state } from "../../lib/state"
import { logEmitter } from "../../util/log-emitter"
import { generateRequestId } from "../../util/id"
import { extractErrorDetails, forwardError } from "../../lib/error"
import { getRouteStrategy } from "../../lib/model-router"
import { passthroughToMessages } from "./passthrough"
import {
  translateToOpenAI,
  translateToAnthropic,
} from "./non-stream-translation"
import {
  translateChunkToAnthropicEvents,
  translateErrorToAnthropicErrorEvent,
} from "./stream-translation"
import { createChatCompletions } from "../../services/copilot/create-chat-completions"
import type { AnthropicStreamState } from "./anthropic-types"
import { deriveClientIdentity } from "../../util/client-identity"
import { resolveProvider } from "../../lib/upstream-router"

export async function handleMessages(c: Context) {
  const startTime = performance.now()
  const requestId = generateRequestId()

  await checkRateLimit(state)

  // Extract request metadata
  const anthropicBeta = c.req.header("anthropic-beta") ?? null
  const userAgent = c.req.header("user-agent") ?? null
  const openaiUser = c.req.header("openai-user") ?? null
  const userId = c.req.header("x-user-id") ?? null
  const { sessionId, clientName, clientVersion } = deriveClientIdentity(userId, userAgent, "default", openaiUser)

  // Read raw body for passthrough, parse for routing decision
  const rawBody = await c.req.text()
  const payload = JSON.parse(rawBody) as { model: string; stream?: boolean; [key: string]: unknown }
  const model = payload.model
  const stream = !!payload.stream

  logEmitter.emitLog({
    ts: Date.now(), level: "info", type: "request_start", requestId,
    msg: `POST /v1/messages ${model}`,
    data: { path: "/v1/messages", format: "anthropic", model, stream, sessionId, clientName, clientVersion },
  })

  // Check for custom provider routing
  const resolved = resolveProvider(model)
  if (resolved) {
    logEmitter.emitLog({
      ts: Date.now(), level: "info", type: "system", requestId,
      msg: `Custom provider matched: ${resolved.provider.name} (pattern: ${resolved.matchedPattern})`,
      data: null,
    })
  }

  const strategy = getRouteStrategy(model)

  try {
    if (strategy === "passthrough") {
      // ★ PASSTHROUGH: Claude models go directly, no translation
      const response = await passthroughToMessages(rawBody, model, stream, anthropicBeta)

      if (stream && response.body) {
        // Stream passthrough: pipe the upstream SSE response directly to the client.
        // Do NOT use Hono's streamSSE — it would double-encode the already-formatted SSE.
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let inputTokens = 0
        let outputTokens = 0

        // Pipe in background, log when done
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              // Extract token usage from SSE events for logging
              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split("\n")
              for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6))
                    if (data.usage) {
                      inputTokens = data.usage.input_tokens ?? inputTokens
                      outputTokens = data.usage.output_tokens ?? outputTokens
                    }
                  } catch { /* ignore parse errors */ }
                }
              }

              await writer.write(value)
            }
          } finally {
            await writer.close()
            reader.releaseLock()
            const latencyMs = Math.round(performance.now() - startTime)
            logEmitter.emitLog({
              ts: Date.now(), level: "info", type: "request_end", requestId,
              msg: `200 ${model} ${latencyMs}ms`,
              data: {
                path: "/v1/messages", format: "anthropic", model,
                strategy: "passthrough",
                inputTokens, outputTokens, latencyMs,
                stream: true, status: "success", statusCode: 200,
                sessionId, clientName, clientVersion,
              },
            })
          }
        })()

        return new Response(readable, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "connection": "keep-alive",
          },
        })
      } else {
        // Non-streaming passthrough
        const body = await response.json()
        const latencyMs = Math.round(performance.now() - startTime)
        const usage = (body as Record<string, unknown>)?.usage as Record<string, number> | undefined
        logEmitter.emitLog({
          ts: Date.now(), level: "info", type: "request_end", requestId,
          msg: `200 ${model} ${latencyMs}ms`,
          data: {
            path: "/v1/messages", format: "anthropic", model,
            strategy: "passthrough",
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            latencyMs, stream: false, status: "success", statusCode: 200,
            sessionId, clientName, clientVersion,
          },
        })
        return c.json(body)
      }
    } else {
      // TRANSLATE: Non-Claude models need Anthropic → OpenAI conversion
      const anthropicPayload = JSON.parse(rawBody)
      const openAIPayload = translateToOpenAI(anthropicPayload)
      const response = await createChatCompletions(openAIPayload)

      if (!stream) {
        // Non-streaming translated response
        const anthropicResponse = translateToAnthropic(response as Parameters<typeof translateToAnthropic>[0])
        const latencyMs = Math.round(performance.now() - startTime)
        logEmitter.emitLog({
          ts: Date.now(), level: "info", type: "request_end", requestId,
          msg: `200 ${model} ${latencyMs}ms`,
          data: {
            path: "/v1/messages", format: "anthropic", model,
            strategy: "translate", latencyMs,
            stream: false, status: "success", statusCode: 200,
          },
        })
        return c.json(anthropicResponse)
      }

      // Streaming translated response
      return streamSSE(c, async (sseStream) => {
        const streamState: AnthropicStreamState = {
          messageStartSent: false,
          contentBlockIndex: 0,
          contentBlockOpen: false,
          toolCalls: {},
        }

        try {
          for await (const event of response as AsyncIterable<{ data: string }>) {
            const chunk = JSON.parse(event.data)
            const anthropicEvents = translateChunkToAnthropicEvents(chunk, streamState)
            for (const evt of anthropicEvents) {
              await sseStream.writeSSE({ event: evt.type, data: JSON.stringify(evt) })
            }
          }
        } catch {
          const errorEvent = translateErrorToAnthropicErrorEvent()
          await sseStream.writeSSE({ event: errorEvent.type, data: JSON.stringify(errorEvent) })
        } finally {
          const latencyMs = Math.round(performance.now() - startTime)
          logEmitter.emitLog({
            ts: Date.now(), level: "info", type: "request_end", requestId,
            msg: `200 ${model} ${latencyMs}ms`,
            data: {
              path: "/v1/messages", format: "anthropic", model,
              strategy: "translate", latencyMs,
              stream: true, status: "success", statusCode: 200,
            sessionId, clientName, clientVersion,
            },
          })
        }
      })
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime)
    const { errorDetail, statusCode } = extractErrorDetails(error)
    logEmitter.emitLog({
      ts: Date.now(), level: "error", type: "request_end", requestId,
      msg: `${statusCode} ${model} ${latencyMs}ms`,
      data: {
        path: "/v1/messages", format: "anthropic", model,
        strategy, latencyMs, stream,
        status: "error", statusCode, error: errorDetail,
        sessionId, clientName, clientVersion,
      },
    })
    return forwardError(c, error)
  }
}
