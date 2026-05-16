import { Hono } from "hono"
import { createChatCompletions } from "../../services/copilot/create-chat-completions"
import { createResponses } from "../../services/copilot/create-responses"
import {
  shouldBridgeToResponses,
  chatToResponses,
  responsesToChat,
  responsesStreamToChat,
} from "../../lib/responses-bridge"
import { extractErrorDetails, forwardError } from "../../lib/error"
import { logEmitter } from "../../util/log-emitter"
import { generateRequestId } from "../../util/id"
import { checkRateLimit } from "../../lib/rate-limit"
import { state } from "../../lib/state"
import type { ServerSentEvent } from "../../util/sse"

export const completionRoutes = new Hono()

completionRoutes.post("/", async (c) => {
  const startTime = performance.now()
  const requestId = generateRequestId()
  await checkRateLimit(state)

  const payload = await c.req.json()
  const model = payload.model
  const stream = !!payload.stream
  const bridge = shouldBridgeToResponses(model)

  // === DIAGNOSTIC: dump request payload to a file so we can inspect ToonFlow's calls ===
  try {
    const fs = await import("fs")
    const dumpPath = "/tmp/conduit-chat-completions-dump.jsonl"
    const summary = {
      ts: Date.now(),
      model,
      stream,
      bridge,
      msg_count: Array.isArray(payload.messages) ? payload.messages.length : 0,
      first_user_msg: (() => {
        const m = (payload.messages || []).find((x: any) => x.role === "user")
        if (!m) return null
        const c = m.content
        return typeof c === "string" ? c.slice(0, 300) : JSON.stringify(c).slice(0, 300)
      })(),
      tools_count: Array.isArray(payload.tools) ? payload.tools.length : 0,
      tool_names: Array.isArray(payload.tools) ? payload.tools.map((t: any) => t.function?.name).slice(0, 10) : [],
      reasoning_effort: payload.reasoning_effort,
      max_completion_tokens: payload.max_completion_tokens ?? payload.max_tokens,
      total_payload_bytes: JSON.stringify(payload).length,
    }
    fs.appendFileSync(dumpPath, JSON.stringify(summary) + "\n")
  } catch (_e) {
    // ignore
  }

  logEmitter.emitLog({
    ts: Date.now(),
    level: "info",
    type: "request_start",
    requestId,
    msg: `POST /v1/chat/completions ${model}${bridge ? " (→/responses bridge)" : ""}`,
    data: { path: "/v1/chat/completions", format: "openai", model, stream, bridge },
  })

  try {
    if (bridge) {
      const respPayload = chatToResponses(payload)
      const upstream = await createResponses(respPayload)

      if (!stream) {
        const chatResp = responsesToChat(upstream as Record<string, unknown>, model)
        const latencyMs = Math.round(performance.now() - startTime)
        logEmitter.emitLog({
          ts: Date.now(),
          level: "info",
          type: "request_end",
          requestId,
          msg: `200 ${model} ${latencyMs}ms`,
          data: {
            path: "/v1/chat/completions",
            model,
            latencyMs,
            stream: false,
            status: "success",
            statusCode: 200,
            bridge: true,
          },
        })
        return c.json(chatResp as object)
      }

      // Streaming bridge
      const events = upstream as AsyncIterable<ServerSentEvent>
      return c.newResponse(
        new ReadableStream({
          async start(controller) {
            try {
              for await (const ev of responsesStreamToChat(events, model)) {
                controller.enqueue(new TextEncoder().encode(`data: ${ev.data}\n\n`))
              }
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
            } finally {
              controller.close()
              const latencyMs = Math.round(performance.now() - startTime)
              logEmitter.emitLog({
                ts: Date.now(),
                level: "info",
                type: "request_end",
                requestId,
                msg: `200 ${model} ${latencyMs}ms`,
                data: {
                  path: "/v1/chat/completions",
                  model,
                  latencyMs,
                  stream: true,
                  status: "success",
                  statusCode: 200,
                  bridge: true,
                },
              })
            }
          },
        }),
        { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
      )
    }

    const response = await createChatCompletions(payload)

    if (!stream) {
      const latencyMs = Math.round(performance.now() - startTime)
      logEmitter.emitLog({
        ts: Date.now(), level: "info", type: "request_end", requestId,
        msg: `200 ${model} ${latencyMs}ms`,
        data: { path: "/v1/chat/completions", model, latencyMs, stream: false, status: "success", statusCode: 200 },
      })
      return c.json(response)
    }

    // Streaming
    return c.newResponse(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const event of response as AsyncIterable<{ data: string }>) {
              controller.enqueue(new TextEncoder().encode(`data: ${event.data}\n\n`))
            }
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
          } finally {
            controller.close()
            const latencyMs = Math.round(performance.now() - startTime)
            logEmitter.emitLog({
              ts: Date.now(), level: "info", type: "request_end", requestId,
              msg: `200 ${model} ${latencyMs}ms`,
              data: { path: "/v1/chat/completions", model, latencyMs, stream: true, status: "success", statusCode: 200 },
            })
          }
        },
      }),
      { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
    )
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime)
    const { errorDetail, statusCode } = extractErrorDetails(error)
    logEmitter.emitLog({
      ts: Date.now(), level: "error", type: "request_end", requestId,
      msg: `${statusCode} ${model} ${latencyMs}ms`,
      data: { path: "/v1/chat/completions", model, latencyMs, stream, status: "error", statusCode, error: errorDetail },
    })
    return forwardError(c, error)
  }
})
