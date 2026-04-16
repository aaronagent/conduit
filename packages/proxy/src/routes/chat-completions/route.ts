import { Hono } from "hono"
import { createChatCompletions } from "../../services/copilot/create-chat-completions"
import { extractErrorDetails, forwardError } from "../../lib/error"
import { logEmitter } from "../../util/log-emitter"
import { generateRequestId } from "../../util/id"
import { checkRateLimit } from "../../lib/rate-limit"
import { state } from "../../lib/state"

export const completionRoutes = new Hono()

completionRoutes.post("/", async (c) => {
  const startTime = performance.now()
  const requestId = generateRequestId()
  await checkRateLimit(state)

  const payload = await c.req.json()
  const model = payload.model
  const stream = !!payload.stream

  logEmitter.emitLog({
    ts: Date.now(), level: "info", type: "request_start", requestId,
    msg: `POST /v1/chat/completions ${model}`,
    data: { path: "/v1/chat/completions", format: "openai", model, stream },
  })

  try {
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
