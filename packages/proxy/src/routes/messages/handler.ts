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

  // ---------------------------------------------------------------------------
  // Web Search interception — Tavily
  //
  // Claude Code sends a dedicated sub-request for web search with a server tool
  // ({type: "web_search_20250305"}) in the tools array. The Copilot upstream
  // does not support Anthropic server tools, so the request would fail silently.
  //
  // When TAVILY_API_KEY is configured we short-circuit the request here: call
  // Tavily for search results and return an Anthropic-native response containing
  // server_tool_use + web_search_tool_result blocks that Claude Code expects.
  // ---------------------------------------------------------------------------
  const anthropicPayload = payload as Record<string, unknown>
  const webSearchServerTool = anthropicPayload.tools
    ? (anthropicPayload.tools as Array<Record<string, unknown>>)?.find(
        (t) => typeof t.type === "string" && (t.type as string).startsWith("web_search_"),
      )
    : undefined

  const tavilyApiKey = state.stWebSearchApiKey || process.env.TAVILY_API_KEY
  if (webSearchServerTool && tavilyApiKey) {
    // Extract the search query from the first user message.
    const messages = (anthropicPayload as { messages: Array<{ content: string | Array<{ type: string; text?: string }> }> }).messages
    const firstMsg = messages[0]
    const rawContent =
      typeof firstMsg?.content === "string"
        ? firstMsg.content
        : Array.isArray(firstMsg?.content)
          ? firstMsg.content
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join(" ")
          : ""
    const query =
      rawContent.replace(/^Perform a web search for the query:\s*/i, "").trim() || rawContent

    // Call Tavily
    let searchResults: Array<{ url: string; title: string; content: string }> = []
    try {
      const tavilyResp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify({ query, max_results: 5 }),
      })
      const tavilyData = (await tavilyResp.json()) as {
        results?: Array<{ url: string; title: string; content: string }>
      }
      searchResults = tavilyData.results ?? []
    } catch {
      // Tavily unavailable — we'll return empty results below
    }

    // Build Anthropic-native response blocks
    const srvId = `srvtoolu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const webResults = searchResults.map((r) => ({
      type: "web_search_result" as const,
      url: r.url,
      title: r.title,
      encrypted_content: "" as const,
      page_age: null as null,
    }))
    const summaryText = searchResults.length
      ? searchResults.map((r) => `${r.title}\n${r.url}\n${r.content}`).join("\n\n---\n\n")
      : "No results found."

    const contentBlocks = [
      { type: "server_tool_use" as const, id: srvId, name: "web_search", input: { query } },
      { type: "web_search_tool_result" as const, tool_use_id: srvId, content: webResults },
      { type: "text" as const, text: summaryText },
    ]
    const responseBody = {
      id: `msg_${requestId}`,
      type: "message" as const,
      role: "assistant" as const,
      model,
      content: contentBlocks,
      stop_reason: "end_turn" as const,
      stop_sequence: null as null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }

    const latencyMs = Math.round(performance.now() - startTime)
    logEmitter.emitLog({
      ts: Date.now(), level: "info", type: "request_end", requestId,
      msg: `200 web_search (tavily) ${latencyMs}ms`,
      data: {
        path: "/v1/messages", format: "anthropic", model,
        latencyMs, stream, status: "success", statusCode: 200,
        sessionId, clientName, clientVersion,
      },
    })

    if (!stream) {
      return c.json(responseBody)
    }

    // Streaming: emit SSE events matching the Anthropic streaming protocol.
    return streamSSE(c, async (sseStream) => {
      const emit = (event: string, data: unknown) =>
        sseStream.writeSSE({ event, data: JSON.stringify(data) })

      await emit("message_start", {
        type: "message_start",
        message: { ...responseBody, content: [], stop_reason: null },
      })

      for (let i = 0; i < contentBlocks.length; i++) {
        await emit("content_block_start", {
          type: "content_block_start",
          index: i,
          content_block: contentBlocks[i],
        })
        const block = contentBlocks[i]!
        if (block.type === "server_tool_use") {
          await emit("content_block_delta", {
            type: "content_block_delta",
            index: i,
            delta: {
              type: "input_json_delta",
              partial_json: JSON.stringify(block.input),
            },
          })
        }
        await emit("content_block_stop", { type: "content_block_stop", index: i })
      }

      await emit("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 0 },
      })
      await emit("message_stop", { type: "message_stop" })
    })
  }
  // --- End Web Search interception ---

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
